# Query Builder Implementation Plan

## Overview

This document outlines the implementation of a new TypeScript query builder for the `lib_new/src/Model.ts` class. The query builder will provide a fluent API similar to the original JavaScript implementation in `lib/query.js`, while maintaining full type safety with Zod schemas and AWS SDK v3 compatibility.

## Architecture

### Design Goals

1. **Type Safety**: Leverage TypeScript and Zod to provide compile-time and runtime type checking
2. **Fluent API**: Enable method chaining for intuitive query building
3. **Schema Awareness**: Only allow operations on fields that exist in the Zod schema
4. **AWS SDK v3**: Use modern AWS SDK with proper error handling
5. **Performance**: Efficient expression building and pagination support

### File Structure

```
lib_new/src/
├── query/
│   ├── QueryBuilder.ts       # Main query builder class
│   ├── QueryConditions.ts    # Condition builders (where/filter)
│   ├── QueryExpressions.ts   # Expression building utilities
│   └── QueryTypes.ts         # Query-specific type definitions
├── types/
│   └── Query.ts             # Query operation types
└── Model.ts                 # Updated with query() method
```

## Type System Design

### Core Types

```typescript
// Query operation types - leveraging AWS SDK types with native values
import type { QueryCommandInput, NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

export interface QueryOptions extends Pick<QueryCommandInput, 
  'ConsistentRead' | 'Limit' | 'ScanIndexForward' | 'ProjectionExpression'
> {
  // Use NativeAttributeValue for pagination keys
  exclusiveStartKey?: Record<string, NativeAttributeValue>;
}

// Query result with pagination
export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
  scannedCount: number;
  consumedCapacity?: any;
}

// Index information
export interface IndexConfig {
  name: string;
  hashKey: string;
  rangeKey?: string;
}
```

### Schema-Aware Types

```typescript
// Extract keys from Zod schema
type SchemaKeys<T extends z.ZodObject<any>> = keyof z.infer<T>;

// Condition operators based on field type
type ConditionOperators<T> = T extends string
  ? StringOperators
  : T extends number
  ? NumberOperators
  : T extends boolean
  ? EqualityOperators
  : BaseOperators;
```

## API Design

### Fluent Interface

```typescript
// Basic hash key query with key-value map
const users = await UserModel.query({ id: 'user123' })
  .filter('status').eq('active')
  .limit(10)
  .exec();

// Composite key query (exact match)
const product = await ProductModel.query({ 
  productId: 'prod-1', 
  category: 'electronics' 
}).exec();

// Partial composite key query with additional conditions
const productVersions = await ProductModel.query({ productId: 'prod-1' })
  .where('category').beginsWith('elect')
  .filter('price').between(100, 1000)
  .exec();

// Global Secondary Index query
const activeUsers = await UserModel.query({ status: 'active' })
  .usingIndex('StatusIndex')
  .filter('lastLogin').gte('2023-01-01')
  .descending()
  .exec();

// Paginated query
let lastKey = undefined;
do {
  const result = await UserModel.query({ id: 'user123' })
    .startKey(lastKey)
    .limit(100)
    .execWithPagination();
  
  processItems(result.items);
  lastKey = result.lastEvaluatedKey;
} while (lastKey);

// Stream large result sets
for await (const batch of UserModel.query({ status: 'active' }).stream()) {
  console.log(`Processing ${batch.length} items`);
  // Process each batch
}

// Load all results at once
const allItems = await UserModel.query({ status: 'active' })
  .loadAll()
  .exec();
```

### Method Categories

#### 1. Query Initialization
- `query(keyValues)` - Initialize query with key-value pairs that generate `eq` conditions automatically
  - `keyValues: Partial<Schema>` - Any field-value pairs from the schema
  - All provided keys become equality conditions in `KeyConditionExpression`
  - Works with hash-only keys: `{ id: 'user123' }`
  - Works with composite keys: `{ productId: 'prod-1', category: 'electronics' }`
  - Works with partial composite keys: `{ productId: 'prod-1' }`

#### 2. Additional Key Conditions (WHERE)
- `where(field)` - Target a specific field for additional key conditions (typically range key operations)
- `eq(value)` - Exact match equality
- `gt(value)`, `gte(value)` - Greater than comparisons
- `lt(value)`, `lte(value)` - Less than comparisons
- `between(min, max)` - Range conditions
- `beginsWith(prefix)` - String prefix matching (range key only)

#### 3. Filter Conditions (Non-Key Attributes)
- `filter(field)` - Target a field for filtering (goes into `FilterExpression`)
- All WHERE operators plus:
- `contains(value)` - Contains substring/element
- `notContains(value)` - Does not contain
- `exists()` - Attribute exists
- `notExists()` - Attribute does not exist
- `in(values)` - Value in array

#### 4. Query Configuration
- `usingIndex(indexName)` - Use Global/Local Secondary Index
- `consistentRead(enabled)` - Enable consistent reads
- `limit(count)` - Limit result count
- `ascending()` / `descending()` - Sort order
- `startKey(key)` - Pagination start key
- `projectionExpression(expression)` - Specify attributes to return
- `returnConsumedCapacity(level)` - Return capacity consumption info

#### 5. Execution Methods
- `exec()` - Execute and return items array
- `execWithPagination(lastKey?)` - Execute and return full result with pagination info
- `loadAll()` - Load all pages automatically (use with caution)
- `stream()` - Return async iterator for large datasets

## Implementation Details

### Simplified Approach with AWS SDK Types

The key insight is to leverage AWS SDK's `QueryCommandInput` type directly instead of manually building request objects. This approach:

- **Eliminates boilerplate**: No need to define custom request interfaces
- **Ensures compatibility**: Always matches AWS SDK expectations  
- **Provides type safety**: TypeScript catches invalid parameters at compile time
- **Simplifies maintenance**: SDK updates automatically propagate

```typescript
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';

// Instead of manually building requests with `any` types:
// const request: any = { TableName: '...' };

// Use the SDK's typed interface directly:
const request: QueryCommandInput = {
  TableName: this.config.tableName,
  KeyConditionExpression: '...',
  ExpressionAttributeNames: {},
  ExpressionAttributeValues: {}
};
```

### 1. QueryBuilder Class - Simplified Key-Value Approach

The actual implementation uses a simplified approach that accepts key-value pairs and generates equality conditions automatically:

```typescript
import type { DynamoDBDocument, QueryCommandInput, NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

export class QueryBuilder<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined
> {
  private keyConditions: ConditionExpression[] = [];
  private filterConditions: ConditionExpression[] = [];
  private options: QueryOptions = {};
  private indexName?: string;
  private isLoadAll = false;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: ModelConfig<TSchema> & {
      hashKey: THashKey;
      rangeKey?: TRangeKey;
    },
    private readonly keyValues: Partial<z.infer<TSchema>>
  ) { }

  // Simplified key condition building - generate eq conditions for all keyValues
  private buildKeyConditions(): ConditionExpression[] {
    const conditions: ConditionExpression[] = [];
    const existingKeys = this.getExistingValueKeys();

    // Generate eq conditions for all provided key values
    for (const [fieldName, value] of Object.entries(this.keyValues)) {
      if (value !== undefined) {
        conditions.push(QueryExpressions.createCondition(
          fieldName,
          '=',
          value as NativeAttributeValue,
          existingKeys
        ));
      }
    }

    return conditions;
  }

  // Build request using AWS SDK's QueryCommandInput type
  private buildRequest(): QueryCommandInput {
    const request: QueryCommandInput = {
      TableName: this.config.tableName
    };

    // Apply options
    if (this.options.ConsistentRead !== undefined) {
      request.ConsistentRead = this.options.ConsistentRead;
    }
    if (this.options.Limit !== undefined) {
      request.Limit = this.options.Limit;
    }
    // ... other options

    if (this.indexName) {
      request.IndexName = this.indexName;
    }

    // Build key conditions directly from keyValues
    const keyConditions = this.buildKeyConditions();
    const allKeyConditions = [...keyConditions, ...this.keyConditions];

    const keyConditionExpression = QueryExpressions.buildKeyCondition(allKeyConditions);

    if (keyConditionExpression.expression) {
      request.KeyConditionExpression = keyConditionExpression.expression;
      
      if (Object.keys(keyConditionExpression.attributeNames).length > 0) {
        request.ExpressionAttributeNames = keyConditionExpression.attributeNames;
      }
      
      if (Object.keys(keyConditionExpression.attributeValues).length > 0) {
        request.ExpressionAttributeValues = keyConditionExpression.attributeValues;
      }
    }

    // Build filter expression if filters exist
    if (this.filterConditions.length > 0) {
      const filterExpression = QueryExpressions.buildFilterExpression(this.filterConditions);
      if (filterExpression.expression) {
        request.FilterExpression = filterExpression.expression;
        
        request.ExpressionAttributeNames = {
          ...request.ExpressionAttributeNames,
          ...filterExpression.attributeNames
        };
        
        request.ExpressionAttributeValues = {
          ...request.ExpressionAttributeValues,
          ...filterExpression.attributeValues
        };
      }
    }

    return request;
  }

  // Execution with proper error handling
  async execWithPagination(lastEvaluatedKey?: Record<string, any>): Promise<QueryResult<z.infer<TSchema>>> {
    const request = this.buildRequest();

    if (lastEvaluatedKey) {
      request.ExclusiveStartKey = lastEvaluatedKey;
    }

    try {
      const response = await this.client.query(request);

      const items = (response.Items || []).map(item =>
        this.validateAndTransform(item)
      );

      return {
        items,
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount || 0,
        consumedCapacity: response.ConsumedCapacity
      };
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Stream support for large datasets
  async *stream(): AsyncIterableIterator<z.infer<TSchema>[]> {
    let lastEvaluatedKey = this.options.ExclusiveStartKey;

    do {
      const result = await this.execWithPagination(lastEvaluatedKey);
      yield result.items;
      lastEvaluatedKey = result.lastEvaluatedKey;
    } while (lastEvaluatedKey);
  }
}
```

### AWS SDK Integration Benefits

Using `QueryCommandInput` directly provides several advantages:

1. **Type Safety**: Full TypeScript support for all DynamoDB query parameters
2. **Future Compatibility**: Automatically supports new AWS SDK features
3. **Reduced Maintenance**: No need to manually maintain request object types
4. **IDE Support**: IntelliSense for all valid query parameters
5. **Validation**: AWS SDK handles parameter validation internally

```typescript
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';

// QueryCommandInput provides these typed properties with native value support:
interface QueryCommandInput {
  TableName: string;
  IndexName?: string;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>; // Native JS values!
  ConsistentRead?: boolean;
  Limit?: number;
  ScanIndexForward?: boolean;
  ExclusiveStartKey?: Record<string, NativeAttributeValue>; // Native JS values!
  ProjectionExpression?: string;
  ReturnConsumedCapacity?: string;
  // ... and more
}

// NativeAttributeValue supports JavaScript native types:
type NativeAttributeValue = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined
  | Uint8Array
  | { [key: string]: NativeAttributeValue }
  | NativeAttributeValue[]
  | Set<string | number | Uint8Array>
  | InstanceType<any>;
```

### Document Client Native Value Benefits

The AWS DynamoDB Document Client provides automatic marshaling/unmarshaling between JavaScript native values and DynamoDB's AttributeValue format:

- **No Manual Conversion**: Work with `string`, `number`, `boolean`, `object`, `array` directly
- **Type Safety**: `NativeAttributeValue` ensures only valid JavaScript types are used
- **Automatic Handling**: Document Client converts to/from DynamoDB's low-level format
- **Simplified Code**: No need to wrap values in `{ S: "value" }` or `{ N: "123" }` format

```typescript
// Before (with low-level client):
ExpressionAttributeValues: {
  ":status": { S: "active" },
  ":age": { N: "25" },
  ":tags": { SS: ["developer", "typescript"] }
}

// After (with Document Client + NativeAttributeValue):
ExpressionAttributeValues: {
  ":status": "active",           // NativeAttributeValue (string)
  ":age": 25,                    // NativeAttributeValue (number)  
  ":tags": ["developer", "ts"]   // NativeAttributeValue (string[])
}
```

### 2. Condition Building with Native Values

```typescript
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';

export interface ConditionExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, NativeAttributeValue>; // Native JS values!
}

export class QueryConditions<T extends NativeAttributeValue> {
  constructor(
    private fieldName: string,
    private addCondition: (condition: ConditionExpression) => QueryBuilder<any, any, any>,
    private existingKeys: string[] = []
  ) {}

  equals(value: T): QueryBuilder<any, any, any> {
    const valueKey = this.generateUniqueValueKey(this.fieldName);
    return this.addCondition({
      expression: `#${this.fieldName} = ${valueKey}`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { [valueKey]: value } // Direct native value assignment!
    });
  }

  greaterThan(value: T): QueryBuilder<any, any, any> {
    const valueKey = this.generateUniqueValueKey(this.fieldName);
    return this.addCondition({
      expression: `#${this.fieldName} > ${valueKey}`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { [valueKey]: value }
    });
  }

  // String-specific operations (when T extends string)
  beginsWith(prefix: string): QueryBuilder<any, any, any> {
    const valueKey = this.generateUniqueValueKey(this.fieldName);
    return this.addCondition({
      expression: `begins_with(#${this.fieldName}, ${valueKey})`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { [valueKey]: prefix }
    });
  }

  contains(substring: string): QueryBuilder<any, any, any> {
    const valueKey = this.generateUniqueValueKey(this.fieldName);
    return this.addCondition({
      expression: `contains(#${this.fieldName}, ${valueKey})`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { [valueKey]: substring }
    });
  }

  between(min: T, max: T): QueryBuilder<any, any, any> {
    const minKey = this.generateUniqueValueKey(`${this.fieldName}_min`);
    const maxKey = this.generateUniqueValueKey(`${this.fieldName}_max`);
    return this.addCondition({
      expression: `#${this.fieldName} BETWEEN ${minKey} AND ${maxKey}`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { 
        [minKey]: min,
        [maxKey]: max 
      }
    });
  }

  in(values: T[]): QueryBuilder<any, any, any> {
    const valueKeys = values.map((_, i) => 
      this.generateUniqueValueKey(`${this.fieldName}_${i}`)
    );
    const inExpression = valueKeys.join(', ');
    
    const attributeValues: Record<string, NativeAttributeValue> = {};
    valueKeys.forEach((key, i) => {
      attributeValues[key] = values[i];
    });

    return this.addCondition({
      expression: `#${this.fieldName} IN (${inExpression})`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues
    });
  }

  private generateUniqueValueKey(base: string): string {
    let counter = 0;
    let key = `:${base}`;
    
    while (this.existingKeys.includes(key)) {
      key = `:${base}_${++counter}`;
    }
    
    this.existingKeys.push(key);
    return key;
  }
}
```

### 3. Expression Building with Native Values

```typescript
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';

export interface DynamoDBExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, NativeAttributeValue>; // Native values!
}

export class QueryExpressions {
  static buildKeyCondition(conditions: ConditionExpression[]): DynamoDBExpression {
    if (conditions.length === 0) {
      return { expression: '', attributeNames: {}, attributeValues: {} };
    }

    // Combine conditions with AND
    const expressions = conditions.map(c => c.expression);
    return {
      expression: expressions.join(' AND '),
      attributeNames: this.mergeAttributeNames(conditions),
      attributeValues: this.mergeAttributeValues(conditions) // Preserves NativeAttributeValue types
    };
  }

  static buildFilterExpression(conditions: ConditionExpression[]): DynamoDBExpression {
    if (conditions.length === 0) {
      return { expression: '', attributeNames: {}, attributeValues: {} };
    }

    // Combine filter conditions with AND
    const expressions = conditions.map(c => c.expression);
    return {
      expression: expressions.join(' AND '),
      attributeNames: this.mergeAttributeNames(conditions),
      attributeValues: this.mergeAttributeValues(conditions)
    };
  }

  static createCondition(
    fieldName: string,
    operator: string,
    value: NativeAttributeValue,
    existingKeys: string[] = []
  ): ConditionExpression {
    const valueKey = this.generateUniqueValueKey(fieldName, existingKeys);
    
    return {
      expression: `#${fieldName} ${operator} ${valueKey}`,
      attributeNames: { [`#${fieldName}`]: fieldName },
      attributeValues: { [valueKey]: value } // Direct native value assignment
    };
  }

  private static mergeAttributeNames(conditions: ConditionExpression[]): Record<string, string> {
    return conditions.reduce((merged, condition) => ({
      ...merged,
      ...condition.attributeNames
    }), {});
  }

  private static mergeAttributeValues(conditions: ConditionExpression[]): Record<string, NativeAttributeValue> {
    return conditions.reduce((merged, condition) => ({
      ...merged,
      ...condition.attributeValues // Preserves all NativeAttributeValue types
    }), {});
  }

  private static generateUniqueValueKey(base: string, existingKeys: string[]): string {
    let counter = 0;
    let key = `:${base}`;
    
    while (existingKeys.includes(key)) {
      key = `:${base}_${++counter}`;
    }
    
    return key;
  }

  // Type-safe condition creation with automatic value handling
  static createTypedCondition<T extends NativeAttributeValue>(
    fieldName: string,
    operator: 'equals' | 'greaterThan' | 'lessThan' | 'beginsWith' | 'contains' | 'between' | 'in',
    value: T | [T, T] | T[], // Different value types based on operator
    existingKeys: string[] = []
  ): ConditionExpression {
    const fieldKey = `#${fieldName}`;
    const attributeNames = { [fieldKey]: fieldName };
    
    switch (operator) {
      case 'equals':
        const eqKey = this.generateUniqueValueKey(fieldName, existingKeys);
        return {
          expression: `${fieldKey} = ${eqKey}`,
          attributeNames,
          attributeValues: { [eqKey]: value as T }
        };
        
      case 'greaterThan':
        const gtKey = this.generateUniqueValueKey(fieldName, existingKeys);
        return {
          expression: `${fieldKey} > ${gtKey}`,
          attributeNames,
          attributeValues: { [gtKey]: value as T }
        };
        
      case 'beginsWith':
        const bwKey = this.generateUniqueValueKey(fieldName, existingKeys);
        return {
          expression: `begins_with(${fieldKey}, ${bwKey})`,
          attributeNames,
          attributeValues: { [bwKey]: value as T }
        };
        
      case 'contains':
        const cKey = this.generateUniqueValueKey(fieldName, existingKeys);
        return {
          expression: `contains(${fieldKey}, ${cKey})`,
          attributeNames,
          attributeValues: { [cKey]: value as T }
        };
        
      case 'between':
        const [min, max] = value as [T, T];
        const minKey = this.generateUniqueValueKey(`${fieldName}_min`, existingKeys);
        const maxKey = this.generateUniqueValueKey(`${fieldName}_max`, [...existingKeys, minKey]);
        return {
          expression: `${fieldKey} BETWEEN ${minKey} AND ${maxKey}`,
          attributeNames,
          attributeValues: { [minKey]: min, [maxKey]: max }
        };
        
      case 'in':
        const values = value as T[];
        const valueKeys = values.map((_, i) => 
          this.generateUniqueValueKey(`${fieldName}_${i}`, existingKeys)
        );
        const attributeValues: Record<string, NativeAttributeValue> = {};
        valueKeys.forEach((key, i) => {
          attributeValues[key] = values[i];
        });
        return {
          expression: `${fieldKey} IN (${valueKeys.join(', ')})`,
          attributeNames,
          attributeValues
        };
        
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }
}
```

## Integration with Model Class

### Model.query() Method - Key-Value Approach

The actual implementation uses a flexible key-value approach instead of requiring only the hash key:

```typescript
export class Model<TSchema, THashKey, TRangeKey> {
  // Existing methods...

  query(keyValues: Partial<z.infer<TSchema>>): QueryBuilder<TSchema, THashKey, TRangeKey> {
    return new QueryBuilder(this.client, this.config, keyValues);
  }
}
```

### Key Benefits of the Key-Value Approach

1. **Flexible Key Specification**: Accept any combination of key fields
   ```typescript
   // Hash key only
   User.query({ id: 'user123' })
   
   // Composite key (exact match)
   Product.query({ productId: 'prod-1', category: 'electronics' })
   
   // Partial composite key
   Product.query({ productId: 'prod-1' })
   ```

2. **Automatic Equality Conditions**: All provided key-value pairs become `eq` conditions
   - No need to distinguish between hash and range keys
   - Simpler API with consistent behavior
   - Works with any key structure

3. **Index Support**: Works seamlessly with secondary indexes
   ```typescript
   // Query GSI with appropriate key fields
   User.query({ status: 'active', department: 'engineering' })
     .usingIndex('StatusDepartmentIndex')
   ```

4. **Type Safety**: Full TypeScript support with schema validation
   ```typescript
   // TypeScript ensures only valid schema fields can be used
   User.query({ invalidField: 'value' }) // ❌ Compile error
   User.query({ id: 'user123' })         // ✅ Valid
   ```

## Error Handling

### Custom Errors

```typescript
export class QueryValidationError extends Error {
  constructor(message: string, public field: string) {
    super(`Query validation error on field '${field}': ${message}`);
  }
}

export class IndexNotFoundError extends Error {
  constructor(indexName: string, tableName: string) {
    super(`Index '${indexName}' not found on table '${tableName}'`);
  }
}
```

## Testing Strategy

### Unit Tests
- Type safety validation
- Expression building correctness
- Error handling
- Method chaining

### Integration Tests
- Actual DynamoDB queries
- Pagination behavior
- Index usage
- Performance benchmarks

## Migration Path

1. **Phase 1**: Core QueryBuilder implementation
2. **Phase 2**: Index support and advanced operators
3. **Phase 3**: Streaming and performance optimizations
4. **Phase 4**: Scan builder (similar pattern)

## Performance Considerations

- **Expression Reuse**: Cache compiled expressions
- **Batch Operations**: Support batch querying
- **Memory Management**: Efficient pagination for large datasets
- **Connection Pooling**: Reuse DynamoDB client connections

## Summary: NativeAttributeValue Benefits

### Key Advantages of AWS SDK Native Value Integration

The updated QueryBuilder implementation leverages AWS SDK's `NativeAttributeValue` and `QueryCommandInput` types to provide:

#### 1. **Type Safety Throughout**
```typescript
// Compile-time validation for all query parameters
const request: QueryCommandInput = {
  TableName: 'users',
  KeyConditionExpression: 'id = :id',
  ExpressionAttributeValues: {
    ':id': 'user123',           // NativeAttributeValue (string)
    ':status': 'active',        // NativeAttributeValue (string)
    ':age': 25,                 // NativeAttributeValue (number)
    ':isActive': true,          // NativeAttributeValue (boolean)
    ':tags': ['dev', 'ts'],     // NativeAttributeValue (string[])
    ':metadata': { role: 'admin' } // NativeAttributeValue (object)
  }
};
```

#### 2. **Simplified Value Handling**
```typescript
// Before: Manual AttributeValue conversion
ExpressionAttributeValues: {
  ':status': { S: 'active' },
  ':age': { N: '25' },
  ':tags': { SS: ['developer', 'typescript'] }
}

// After: Direct JavaScript values
ExpressionAttributeValues: {
  ':status': 'active',           // Document Client handles conversion
  ':age': 25,                    // No manual wrapping needed
  ':tags': ['developer', 'ts']   // Native array support
}
```

#### 3. **Automatic Marshaling/Unmarshaling**
- **Input**: JavaScript native values → DynamoDB AttributeValue format
- **Output**: DynamoDB AttributeValue format → JavaScript native values
- **Zero boilerplate**: Document Client handles all conversions
- **Type preservation**: Maintains proper JavaScript types throughout

#### 4. **Future-Proof Architecture**
- **SDK Evolution**: Automatically inherits new AWS SDK features
- **Reduced Maintenance**: No custom request object definitions to maintain
- **IDE Support**: Full IntelliSense for all query parameters
- **Error Prevention**: TypeScript catches invalid parameters at compile-time

#### 5. **Developer Experience Improvements**
```typescript
// Clean, intuitive API using native values
const results = await Post.query('user123')
  .where('publishedAt').greaterThan('2024-01-01')  // string comparison
  .filter('views').between(100, 1000)              // number range
  .filter('featured').equals(true)                 // boolean match
  .filter('tags').contains('typescript')           // array/string contains
  .filter('category').in(['tech', 'tutorial'])     // array membership
  .limit(10)
  .exec();
```

### Implementation Highlights

1. **QueryCommandInput**: Direct use of AWS SDK's typed interface
2. **NativeAttributeValue**: All value operations use JavaScript native types
3. **Type Inference**: Full TypeScript support with schema-based field validation
4. **Expression Building**: Automatic generation of DynamoDB expressions
5. **Pagination Support**: Native value support for `ExclusiveStartKey`

This approach eliminates the complexity of manual AttributeValue handling while providing comprehensive type safety and maintaining full compatibility with AWS DynamoDB's feature set.

## Future Enhancements

- **Query Composition**: Combine multiple queries using native value types
- **Caching Layer**: Optional query result caching with native value serialization
- **Metrics**: Query performance monitoring with typed parameter analysis
- **Debug Mode**: Query explanation and optimization hints with expression visualization