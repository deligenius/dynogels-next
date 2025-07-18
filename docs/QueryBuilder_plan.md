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
// Query operation types
export interface QueryOptions {
  consistentRead?: boolean;
  limit?: number;
  scanIndexForward?: boolean;
  exclusiveStartKey?: Record<string, any>;
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
// Basic query
const users = await UserModel.query('user123')
  .where('createdAt').gt('2023-01-01')
  .filter('status').equals('active')
  .limit(10)
  .exec();

// Global Secondary Index query
const activeUsers = await UserModel.query('organization123')
  .usingIndex('GSI1')
  .where('status').equals('active')
  .filter('lastLogin').gt(Date.now() - 86400000)
  .descending()
  .exec();

// Paginated query
let lastKey = undefined;
do {
  const result = await UserModel.query('user123')
    .startKey(lastKey)
    .limit(100)
    .execWithPagination();
  
  processItems(result.items);
  lastKey = result.lastEvaluatedKey;
} while (lastKey);

// Load all results
const allItems = await UserModel.query('user123')
  .loadAll()
  .exec();
```

### Method Categories

#### 1. Key Conditions (WHERE)
- `where(field)` - Target a specific field for key conditions
- `equals(value)` - Exact match
- `gt(value)`, `gte(value)` - Greater than comparisons
- `lt(value)`, `lte(value)` - Less than comparisons
- `between(min, max)` - Range conditions
- `beginsWith(prefix)` - String prefix matching

#### 2. Filter Conditions
- `filter(field)` - Target a field for filtering
- All WHERE operators plus:
- `contains(value)` - Contains substring/element
- `notContains(value)` - Does not contain
- `exists()` - Attribute exists
- `notExists()` - Attribute does not exist
- `in(values)` - Value in array

#### 3. Query Configuration
- `usingIndex(indexName)` - Use Global/Local Secondary Index
- `consistentRead(enabled)` - Enable consistent reads
- `limit(count)` - Limit result count
- `ascending()` / `descending()` - Sort order
- `startKey(key)` - Pagination start key

#### 4. Execution
- `exec()` - Execute and return items array
- `execWithPagination()` - Execute and return full result with pagination info
- `loadAll()` - Load all pages automatically
- `stream()` - Return async iterator for large datasets

## Implementation Details

### 1. QueryBuilder Class

```typescript
export class QueryBuilder<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined
> {
  private hashKeyValue: z.infer<TSchema>[THashKey];
  private keyConditions: ConditionExpression[] = [];
  private filterConditions: ConditionExpression[] = [];
  private options: QueryOptions = {};
  private indexName?: string;

  constructor(
    private client: DynamoDBDocument,
    private config: ModelConfig<TSchema>,
    hashKeyValue: z.infer<TSchema>[THashKey]
  ) {
    this.hashKeyValue = hashKeyValue;
  }

  // Fluent methods...
}
```

### 2. Condition Building

```typescript
export class QueryConditions<T> {
  constructor(
    private fieldName: string,
    private addCondition: (condition: ConditionExpression) => QueryBuilder<any, any, any>
  ) {}

  equals(value: T): QueryBuilder<any, any, any> {
    return this.addCondition({
      expression: `#${this.fieldName} = :${this.fieldName}`,
      attributeNames: { [`#${this.fieldName}`]: this.fieldName },
      attributeValues: { [`:${this.fieldName}`]: value }
    });
  }

  // Other operators...
}
```

### 3. Expression Building

```typescript
export class QueryExpressions {
  static buildKeyCondition(conditions: ConditionExpression[]): DynamoDBExpression {
    // Combine conditions with AND
    const expressions = conditions.map(c => c.expression);
    return {
      expression: expressions.join(' AND '),
      attributeNames: this.mergeAttributeNames(conditions),
      attributeValues: this.mergeAttributeValues(conditions)
    };
  }

  static buildFilterExpression(conditions: ConditionExpression[]): DynamoDBExpression {
    // Similar to key condition but for FilterExpression
  }

  // Utility methods for merging attributes...
}
```

## Integration with Model Class

### Model.query() Method

```typescript
export class Model<TSchema, THashKey, TRangeKey> {
  // Existing methods...

  query(hashKeyValue: z.infer<TSchema>[THashKey]): QueryBuilder<TSchema, THashKey, TRangeKey> {
    return new QueryBuilder(this.client, this.config, hashKeyValue);
  }
}
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

## Future Enhancements

- **Query Composition**: Combine multiple queries
- **Caching Layer**: Optional query result caching
- **Metrics**: Query performance monitoring
- **Debug Mode**: Query explanation and optimization hints