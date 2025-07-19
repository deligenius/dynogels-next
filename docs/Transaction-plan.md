# Transaction Implementation Plan

## Overview

This document outlines the design and implementation plan for DynamoDB transactions in Dynogels Next, inspired by Dynamoose's transaction API design but built with modern TypeScript patterns and AWS SDK v3.

## API Design Philosophy

The transaction system follows these core principles:
- **Type Safety**: Full TypeScript support with compile-time validation
- **Model Integration**: Seamless integration with existing Model classes
- **AWS SDK v3 Native**: Built on `TransactWriteItemsCommand` and `TransactGetItemsCommand`
- **Fluent API**: Easy-to-use builder pattern similar to Dynamoose
- **Schema Validation**: Automatic Zod schema validation for all operations

## Dynamoose API Analysis

Based on research, Dynamoose provides:
```javascript
// Dynamoose transaction API
await dynamoose.transaction([
  User.transaction.update({"id": "user1"}, {"$ADD": {"balance": -100}}),
  Charge.transaction.create({"userid": "user1", ...}),
  Product.transaction.update({"id": "product1"}, {"$ADD": {"inventory": -1}}),
  Credit.transaction.delete({"id": "credit1"})
]);
```

## AWS SDK v3 Transaction Commands

AWS SDK v3 provides two main transaction operations:

### TransactWriteItemsCommand
- Supports: Put, Update, Delete, ConditionCheck operations
- Up to 25 operations per transaction
- Atomic: all operations succeed or all fail
- Input structure:
```typescript
{
  TransactItems: [
    {
      Put?: { TableName, Item, ConditionExpression?, ... },
      Update?: { TableName, Key, UpdateExpression, ConditionExpression?, ... },
      Delete?: { TableName, Key, ConditionExpression?, ... },
      ConditionCheck?: { TableName, Key, ConditionExpression }
    }
  ]
}
```

### TransactGetItemsCommand  
- Supports: Get operations only
- Up to 100 operations per transaction
- Atomic reads with point-in-time consistency
- Input structure:
```typescript
{
  TransactItems: [
    {
      Get: { TableName, Key, ProjectionExpression?, ... }
    }
  ]
}
```

### BatchWriteItemCommand
- Supports: Put and Delete operations (no Update)
- Up to 25 operations per batch
- **Not atomic**: operations may partially succeed
- Used for performance, not consistency

## Proposed API Design

### 1. Transaction Factory Pattern

```typescript
import { Transaction } from './Transaction.js';

// Create transaction instance
const transaction = new Transaction(dynamoDBClient);

// Or factory method from ModelFactory
const transaction = factory.transaction();
```

### 2. Model Transaction Methods

Each Model instance gets transaction methods:

```typescript
class Model {
  transaction = {
    create: (item: CreateInput) => TransactionOperation,
    update: (key: PrimaryKey, updates: UpdateInput) => TransactionOperation,
    delete: (key: PrimaryKey) => TransactionOperation,
    conditionCheck: (key: PrimaryKey, condition: ConditionExpression) => TransactionOperation,
    get: (key: PrimaryKey) => TransactionOperation,
  };
}
```

### 3. Fluent Transaction Builder

```typescript
// Write transactions (TransactWriteItems)
await transaction
  .add(User.transaction.update({ id: 'user1' }, { balance: 100 }))
  .add(Account.transaction.create({ id: 'acc1', userId: 'user1' }))
  .add(Product.transaction.delete({ id: 'prod1' }))
  .condition(User.transaction.conditionCheck({ id: 'user1' }, (c) => c.field('id').exists()))
  .exec();

// Read transactions (TransactGetItems)  
const results = await transaction
  .get(User.transaction.get({ id: 'user1' }))
  .get(Account.transaction.get({ id: 'acc1' }))
  .exec();
```

## Architecture Components

### 1. Transaction Class (`src/Transaction.ts`)

**Purpose**: Main transaction orchestrator
**Key Methods**:
- `add(operation)` - Add write operation
- `get(operation)` - Add read operation  
- `condition(operation)` - Add condition check
- `clientRequestToken(token)` - Set idempotency token
- `returnConsumedCapacity(level)` - Set capacity reporting
- `exec()` - Execute transaction

**Features**:
- Automatic operation type detection
- Separate read/write transaction handling
- Schema validation of results
- Error handling with detailed failure info

### 2. TransactionOperation Class (`src/transaction/TransactionOperation.ts`)

**Purpose**: Represents a single transaction operation
**Properties**:
- `type`: 'Put' | 'Update' | 'Delete' | 'ConditionCheck' | 'Get'
- `tableName`: string
- `key`: Record<string, any>
- `item?`: Record<string, any> (for Put operations)
- `updateExpression?`: string (for Update operations)
- `conditionExpression?`: string
- `model`: Model instance (for result validation)

### 3. TransactionBuilder Class (`src/transaction/TransactionBuilder.ts`)

**Purpose**: Fluent API builder for constructing transactions
**Key Methods**:
- `add(operation)` - Add write operation
- `get(operation)` - Add read operation
- `condition(operation)` - Add condition check
- `clientRequestToken(token)` - Set idempotency token
- `returnConsumedCapacity(level)` - Set capacity reporting
- `exec()` - Execute and return results

### 4. ConditionBuilder Integration (`src/transaction/ConditionBuilder.ts`)

**Purpose**: Type-safe condition expression builder for transaction operations
**Key Features**:
- **Generic Type Safety**: `ConditionBuilder<TSchema>` constrains field access to schema keys
- **Schema-Aware Field Validation**: `field<TField extends SchemaKeys<TSchema>>(fieldName: TField)` provides autocomplete
- **Type-Aware Operators**: String fields get `StringQueryConditions`, others get `QueryConditions`
- **Logical Operators**: Support for `and()`, `or()`, `not()` with nested condition builders
- **AWS SDK v3 Integration**: Native value handling with proper expression building

**Type Safety Implementation**:
```typescript
export class ConditionBuilder<TSchema extends z.ZodObject<any>> {
  field<TField extends SchemaKeys<TSchema>>(fieldName: TField) {
    const fieldType = this.getFieldType(fieldName);
    
    if (fieldType === 'string') {
      return new StringQueryConditions<TSchema, TField, this>(...);
    }
    return new QueryConditions<TSchema, TField, this>(...);
  }
}
```

**Field Type Detection**:
- Analyzes Zod schema shape to determine field types
- Supports optional and nullable string fields
- Returns appropriate condition builders based on field type

### 5. Model Transaction Integration (`src/Model.ts`)

Add transaction property to Model class:

```typescript
export class Model {
  transaction = {
    create: (item: Omit<z.infer<TSchema>, 'createdAt' | 'updatedAt'>) => {
      return new TransactionOperation('Put', this.config.tableName, {
        item: this.prepareCreateItem(item),
        conditionExpression: `attribute_not_exists(${String(this.config.hashKey)})`,
        model: this
      });
    },

    update: (key: PrimaryKey, updates: UpdateInput) => {
      return new TransactionOperation('Update', this.config.tableName, {
        key,
        updateExpression: this.buildUpdateExpression(updates),
        conditionExpression: `attribute_exists(${String(this.config.hashKey)})`,
        model: this
      });
    },

    delete: (key: PrimaryKey) => {
      return new TransactionOperation('Delete', this.config.tableName, {
        key,
        model: this
      });
    },

    conditionCheck: (key: PrimaryKey, conditionBuilder: (builder: ConditionBuilder<TSchema>) => ConditionBuilder<TSchema>) => {
      const builder = new ConditionBuilder(this.config.schema);
      const result = conditionBuilder(builder);
      const condition = result.build();
      return new TransactionOperation('ConditionCheck', this.config.tableName, {
        key,
        conditionExpression: condition.expression,
        expressionAttributeNames: condition.attributeNames,
        expressionAttributeValues: condition.attributeValues,
        model: this
      });
    },

    get: (key: PrimaryKey) => {
      return new TransactionOperation('Get', this.config.tableName, {
        key,
        model: this
      });
    }
  };
}
```

## Type Safety Features

### 1. Operation Type Validation

```typescript
type WriteOperation = TransactionOperation<'Put' | 'Update' | 'Delete' | 'ConditionCheck'>;
type ReadOperation = TransactionOperation<'Get'>;

class TransactionBuilder {
  add(operation: WriteOperation): this;
  get(operation: ReadOperation): this;
}
```

### 2. Schema-Constrained Condition Building

The ConditionBuilder provides full type safety with schema-aware field access:

```typescript
// Type-safe field access with autocomplete
Product.transaction.conditionCheck(
  { id: 'prod1' },
  (c) => c.field('inventory').gte(2)  // 'inventory' constrained to Product schema keys
    .and(c.field('status').eq('active'))  // 'status' also constrained 
    .and(c.field('price').between(10, 100))  // Type-aware operators
);

// TypeScript errors for invalid fields
Product.transaction.conditionCheck(
  { id: 'prod1' },
  (c) => c.field('invalidField').eq('value')  // ❌ TypeScript error
);
```

### 3. Field Type-Aware Operators

Different field types get appropriate operator methods:

```typescript
// String fields
c.field('name').eq('value')
c.field('name').beginsWith('prefix')
c.field('name').contains('substring')

// Number fields  
c.field('price').gte(100)
c.field('price').between(10, 100)
c.field('inventory').gt(0)

// Boolean fields
c.field('isActive').eq(true)
c.field('isDeleted').exists()
```

### 4. Result Type Inference

```typescript
interface TransactionResult<T extends TransactionOperation[]> {
  items: {
    [K in keyof T]: T[K] extends TransactionOperation<'Get', infer TModel>
      ? z.infer<TModel['config']['schema']> | null
      : never
  };
  consumedCapacity?: ConsumedCapacity[];
  itemCollectionMetrics?: ItemCollectionMetrics[];
}
```

### 5. Schema Validation

All transaction results are automatically validated using the associated Model's Zod schema:

```typescript
private validateResult<TSchema extends z.ZodObject<any>>(
  item: any,
  schema: TSchema
): z.infer<TSchema> | null {
  if (!item) return null;
  return schema.parse(item);
}
```

## Usage Examples

### Example 1: E-commerce Order Transaction

```typescript
const factory = new ModelFactory(dynamoDBClient);

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users'
});

const Order = factory.defineModel({
  hashKey: 'id', 
  schema: orderSchema,
  tableName: 'orders'
});

const Product = factory.defineModel({
  hashKey: 'id',
  schema: productSchema, 
  tableName: 'products'
});

// Create order transaction
const transaction = factory.transaction();

await transaction
  .add(User.transaction.update(
    { id: 'user123' }, 
    { orderCount: { $ADD: 1 } }
  ))
  .add(Order.transaction.create({
    id: 'order456',
    userId: 'user123',
    productId: 'prod789',
    quantity: 2,
    status: 'pending'
  }))
  .add(Product.transaction.update(
    { id: 'prod789' },
    { inventory: { $ADD: -2 } }
  ))
  .condition(Product.transaction.conditionCheck(
    { id: 'prod789' },
    (c) => c.field('inventory').gte(2)  // ✅ TypeScript autocomplete for 'inventory'
  ))
  .exec();
```

### Example 2: Read Transaction with Type Safety

```typescript
const results = await transaction
  .get(User.transaction.get({ id: 'user123' }))
  .get(Order.transaction.get({ id: 'order456' }))
  .exec();

// Results are fully typed
const user: User | null = results.items[0]; 
const order: Order | null = results.items[1];
```

### Example 3: Complex Conditional Transaction

```typescript
await transaction
  .add(User.transaction.update({ id: 'user1' }, { balance: { $ADD: -100 } }))
  .add(Charge.transaction.create({ id: 'charge1', userId: 'user1', amount: 100 }))
  .add(Product.transaction.update({ id: 'prod1' }, { inventory: { $ADD: -1 } }))
  .condition(User.transaction.conditionCheck(
    { id: 'user1' },
    (c) => c.field('balance').gte(100).and(c.field('status').eq('active'))  // ✅ Schema-constrained fields
  ))
  .condition(Product.transaction.conditionCheck(
    { id: 'prod1' },
    (c) => c.field('inventory').gt(0)  // ✅ Number field gets numeric operators
  ))
  .clientRequestToken('unique-transaction-123')
  .returnConsumedCapacity('TOTAL')
  .exec();
```

## Error Handling

### Transaction Failure Types

1. **ValidationError**: Schema validation failed
2. **ConditionalCheckFailedException**: Condition expression failed  
3. **TransactionCanceledException**: Transaction was cancelled
4. **ResourceNotFoundException**: Table/item not found
5. **ProvisionedThroughputExceededException**: Rate limit exceeded

### Error Response Structure

```typescript
interface TransactionError extends Error {
  name: string;
  message: string;
  cancellationReasons?: {
    Code?: string;
    Message?: string;
    Item?: Record<string, any>;
  }[];
  operation?: TransactionOperation;
}
```

### Error Handling Example

```typescript
try {
  await transaction
    .add(User.transaction.update({ id: 'user1' }, { balance: 100 }))
    .exec();
} catch (error) {
  if (error instanceof TransactionError) {
    console.error('Transaction failed:', error.message);
    error.cancellationReasons?.forEach((reason, index) => {
      console.error(`Operation ${index} failed:`, reason.Code, reason.Message);
    });
  }
}
```

## Performance Considerations

### 1. Batch Size Limits
- **Write transactions**: Maximum 25 operations
- **Read transactions**: Maximum 100 operations
- **Item size**: Maximum 400KB per item
- **Transaction size**: Maximum 4MB total

### 2. Throughput Consumption
- Each operation consumes read/write capacity
- Transaction operations are billed at standard rates
- Failed transactions still consume capacity for condition checks

### 3. Optimization Strategies
- Group related operations in single transactions
- Use condition checks sparingly 
- Consider eventual consistency for read operations
- Implement retry logic with exponential backoff

## Implementation Phases

### Phase 1: Core Transaction Infrastructure
- [ ] Create `Transaction` class
- [ ] Create `TransactionOperation` class  
- [ ] Create `TransactionBuilder` class
- [ ] Basic write transaction support (`TransactWriteItemsCommand`)
- [ ] Basic read transaction support (`TransactGetItemsCommand`)

### Phase 2: Model Integration
- [ ] Add `transaction` property to `Model` class
- [ ] Implement transaction operation methods (create, update, delete, etc.)
- [ ] Add timestamp handling for transaction operations
- [ ] Schema validation for transaction results

### Phase 3: Advanced Features
- [ ] Condition expression builder integration
- [ ] Update expression builder for complex updates
- [ ] Idempotency token support
- [ ] Consumed capacity reporting
- [ ] Item collection metrics

### Phase 4: Developer Experience
- [ ] Comprehensive error handling
- [ ] TypeScript type inference improvements
- [ ] Transaction debugging utilities
- [ ] Performance optimization utilities

### Phase 5: Testing & Documentation
- [ ] Unit tests for all transaction components
- [ ] Integration tests with DynamoDB Local
- [ ] Performance benchmarks
- [ ] API documentation and examples
- [ ] Migration guide from other libraries

## File Structure

```
src/
├── Transaction.ts                    # Main transaction class
├── transaction/
│   ├── TransactionBuilder.ts         # Fluent API builder
│   ├── TransactionOperation.ts       # Individual operation representation  
│   ├── TransactionError.ts          # Error handling classes
│   └── ExpressionBuilder.ts         # Condition/Update expression utilities
├── types/
│   └── Transaction.ts                # TypeScript type definitions
└── examples/
    └── transaction_demo.ts           # Usage examples
```

## Comparison with Dynamoose

| Feature | Dynamoose | Dynogels Next |
|---------|-----------|---------------|
| API Style | Array-based | Fluent builder only |
| Type Safety | Limited | Full TypeScript with Zod |
| AWS SDK | v2/v3 | v3 native |
| Schema Validation | Dynamoose schemas | Zod schemas |
| Error Handling | Basic | Detailed with cancellation reasons |
| Expression Building | Manual | Type-safe condition builders |
| Model Integration | `Model.transaction.*` | `Model.transaction.*` |
| Read Transactions | ✅ | ✅ |
| Write Transactions | ✅ | ✅ |
| Condition Checks | String expressions | Fluent condition builders |
| Performance | Basic | Optimized for AWS SDK v3 |

## Benefits

1. **Complete Type Safety**: Full TypeScript integration with compile-time field validation and autocomplete
2. **Schema-Aware Conditions**: Field names constrained to actual schema keys with `SchemaKeys<TSchema>`
3. **Type-Aware Operators**: Different operators available based on field types (string vs number vs boolean)
4. **Modern Architecture**: Built on AWS SDK v3 with Promise-first design
5. **Schema Integration**: Automatic Zod validation for all operations and results
6. **Flexible API**: Fluent builder pattern with chainable condition expressions
7. **Error Handling**: Detailed error information with operation-specific failures
8. **Performance**: Optimized for AWS SDK v3 with minimal overhead
9. **Developer Experience**: Full IntelliSense support, autocomplete, and clear compile-time errors

## Enhanced Type Safety Implementation

The transaction system now provides:

- **Field Autocomplete**: `c.field('inventory')` shows only valid schema fields
- **Compile-Time Validation**: Invalid field names cause TypeScript errors
- **Type-Aware Methods**: String fields get `beginsWith()`, `contains()`, numeric fields get `gte()`, `between()`
- **Nested Conditions**: Support for complex logical expressions with `and()`, `or()`, `not()`
- **Schema Integration**: Full integration with existing Zod schemas and Model configurations

This design provides a modern, fully type-safe transaction system that leverages the latest AWS SDK v3 features and TypeScript capabilities with comprehensive schema integration.