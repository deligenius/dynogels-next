# Scan Builder Implementation Plan

## Overview

This document outlines the implementation plan for the TypeScript ScanBuilder for the `lib_new/src/Model.ts` class. The ScanBuilder provides a fluent API for DynamoDB table scans with full type safety using Zod schemas and AWS SDK v3 native value support.

**Status**: 📋 **PLANNING PHASE**
- Architecture design based on proven QueryBuilder pattern
- Type safety with schema validation  
- AWS SDK v3 native value integration
- Comprehensive operator support
- Pagination and streaming support
- Parallel scan capabilities

## Architecture

### Design Goals

1. **Type Safety**: Full TypeScript and Zod integration with compile-time and runtime validation
2. **Fluent API**: Complete method chaining with intuitive scan building
3. **Schema Awareness**: Only schema fields allowed, type-aware operators (string fields get `beginsWith()`, etc.)
4. **AWS SDK v3**: Native value support with `ScanCommandInput` and `NativeAttributeValue`
5. **Performance**: Efficient expression building, pagination, streaming, and parallel scan support

### File Structure

```
lib_new/src/
├── scan/
│   ├── ScanBuilder.ts        # Main scan builder class with fluent API
│   ├── ScanConditions.ts     # Type-aware condition builders (reuse from QueryConditions)
│   └── ScanExpressions.ts    # Expression building utilities (reuse from QueryExpressions)
├── types/
│   └── Scan.ts              # Scan operation types with AWS SDK integration
└── Model.ts                 # Integration with scan() method
```

### Key Differences from QueryBuilder

#### 1. **No Key Conditions**
- Scans don't use `KeyConditionExpression` (only queries do)
- All conditions go into `FilterExpression`
- No `where()` method - only `filter()` method

#### 2. **Parallel Scan Support**
- `segments(segment, totalSegments)` method for parallel scanning
- Each segment scans a portion of the table
- Useful for large tables and performance optimization

#### 3. **Different AWS SDK Operation**
- Uses `ScanCommandInput` instead of `QueryCommandInput`
- Uses `client.scan()` instead of `client.query()`
- Different performance characteristics (scans entire table vs targeted query)

#### 4. **No Index Restrictions**
- Can scan the main table or any Global Secondary Index
- No complex key validation needed (unlike queries)

## Type System Design

### Core Types

```typescript
// Scan operation types - leveraging AWS SDK types with native values
import type { ScanCommandInput, NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

// Direct AWS SDK integration
export interface ScanOptions extends Pick<ScanCommandInput, 
  'ConsistentRead' | 'Limit' | 'ProjectionExpression' | 'ReturnConsumedCapacity' | 
  'Segment' | 'TotalSegments'
> {
  // Native value support for pagination
  ExclusiveStartKey?: Record<string, NativeAttributeValue>;
}

// Complete scan result interface
export interface ScanResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, NativeAttributeValue>;  // Native values
  count: number;
  scannedCount: number;
  consumedCapacity?: any;
}

// Reuse ConditionExpression from QueryBuilder
export interface ConditionExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, NativeAttributeValue>;
}
```

### Schema-Aware Types

```typescript
// Reuse from QueryBuilder
export type SchemaKeys<T extends z.ZodObject<any>> = keyof z.infer<T>;

// Reuse existing condition operators from QueryBuilder
export interface StringOperators<TBuilder> {
  equals(value: string): TBuilder;
  eq(value: string): TBuilder;
  beginsWith(prefix: string): TBuilder;   // String-specific
  contains(substring: string): TBuilder;  // String-specific
  notContains(substring: string): TBuilder;
  between(min: string, max: string): TBuilder;
  in(values: string[]): TBuilder;
  // ... all comparison operators
}

export interface NumberOperators<TBuilder> {
  equals(value: number): TBuilder;
  eq(value: number): TBuilder;
  between(min: number, max: number): TBuilder;  // Number-specific
  // ... no beginsWith/contains (not applicable)
}

// Runtime type detection in ScanBuilder (reuse from QueryBuilder)
private isStringField(fieldName: SchemaKeys<TSchema>): boolean {
  // Checks Zod schema to determine if field is string type
  // Returns appropriate condition class (StringFilterConditions vs FilterConditions)
}
```

## API Design

### Fluent Interface

```typescript
// Basic table scan with filters
const users = await UserModel.scan()
  .filter('status').eq('active')
  .filter('age').gte(18)
  .limit(100)
  .exec();

// Scan with string-specific operators
const products = await ProductModel.scan()
  .filter('name').contains('iPhone')
  .filter('category').beginsWith('electronics')
  .filter('price').between(100, 1000)
  .exec();

// Scan with Global Secondary Index
const activeUsers = await UserModel.scan()
  .usingIndex('StatusIndex')
  .filter('status').eq('active')
  .filter('lastLogin').gte('2023-01-01')
  .exec();

// Parallel scan for large tables
const segment1 = await UserModel.scan()
  .segments(0, 4)  // Scan segment 0 of 4 total segments
  .filter('status').eq('active')
  .exec();

const segment2 = await UserModel.scan()
  .segments(1, 4)  // Scan segment 1 of 4 total segments
  .filter('status').eq('active')
  .exec();

// Paginated scan
let lastKey = undefined;
do {
  const result = await UserModel.scan()
    .filter('status').eq('active')
    .startKey(lastKey)
    .limit(100)
    .execWithPagination();
  
  processItems(result.items);
  lastKey = result.lastEvaluatedKey;
} while (lastKey);

// Stream large result sets
for await (const batch of UserModel.scan().filter('status').eq('active').stream()) {
  console.log(`Processing ${batch.length} items`);
  // Process each batch - yields arrays of items
}

// Load all results at once (use with caution)
const allItems = await UserModel.scan()
  .filter('status').eq('active')
  .loadAll()
  .exec();

// Advanced scan with all features
const complexScan = await ProductModel.scan()
  .filter('category').beginsWith('electronics')
  .filter('price').between(100, 500)
  .filter('inStock').eq(true)
  .filter('tags').contains('featured')
  .projectionExpression('productId, category, #name, price')
  .consistentRead(true)
  .returnConsumedCapacity('TOTAL')
  .limit(20)
  .exec();
```

### Method Categories

#### 1. Scan Initialization
- **`scan()`** - Initialize scan (no parameters, unlike query)
  - No key conditions needed
  - Returns ScanBuilder instance

#### 2. Filter Conditions (All Attributes)
- **`filter(field)`** - Target a field for filtering (all conditions go into `FilterExpression`)
- **Type-aware operators**: String fields get `StringFilterConditions`, others get `FilterConditions`
- **Available operators**:
  - `eq(value)` / `equals(value)` - Exact match equality
  - `gt(value)` / `greaterThan(value)`, `gte(value)` - Greater than comparisons
  - `lt(value)` / `lessThan(value)`, `lte(value)` - Less than comparisons  
  - `ne(value)` / `notEqual(value)` - Not equal
  - `between(min, max)` - Range conditions
  - `in(values)` - Value in array
  - `exists()` / `notExists()` - Attribute existence
  - **String-only**: `beginsWith(prefix)`, `contains(value)`, `notContains(value)` - String operations

#### 3. Scan Configuration
- `usingIndex(indexName)` - Use Global Secondary Index with **full type inference**
- `consistentRead(enabled = true)` - Enable/disable consistent reads
- `limit(count)` - Limit result count (with validation)
- `startKey(key)` - Pagination start key (`ExclusiveStartKey`)
- `projectionExpression(expression)` - Specify attributes to return
- `returnConsumedCapacity(level)` - Return capacity consumption info ('INDEXES' | 'TOTAL' | 'NONE')
- `segments(segment, totalSegments)` - **Parallel scan configuration**
- `loadAll()` - Load all pages automatically (use with caution)

#### 4. Execution Methods
- `exec()` - Execute and return items array (uses `loadAll` if set, otherwise single page)
- `execWithPagination(lastKey?)` - Execute and return full result with pagination info
- `stream()` - Return `AsyncIterableIterator<T[]>` for large datasets  
- **Result validation**: All results validated against Zod schema
- **Error handling**: Comprehensive error messages with context

## Implementation Details

### 1. ScanBuilder Class

```typescript
import type { DynamoDBDocument, NativeAttributeValue, ScanCommandInput } from '@aws-sdk/lib-dynamodb';

export class ScanBuilder<
  TSchema extends z.ZodObject<any>,
  TConfig extends ModelConfig<TSchema> = ModelConfig<TSchema>
> {
  private filterConditions: ConditionExpression[] = [];
  private options: ScanOptions = {};
  private indexName?: string;
  private isLoadAll = false;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: TConfig
  ) {}

  // Only filter method - no where() method like QueryBuilder
  filter<TField extends SchemaKeys<TSchema>>(fieldName: TField): any {
    const existingKeys = this.getExistingValueKeys();
    const addCondition = (condition: ConditionExpression) => {
      this.filterConditions.push(condition);
      return this;
    };

    if (this.isStringField(fieldName)) {
      return new StringFilterConditions(String(fieldName), addCondition, existingKeys);
    }

    return new FilterConditions(String(fieldName), addCondition, existingKeys);
  }

  // Parallel scan support
  segments(segment: number, totalSegments: number): this {
    if (segment < 0 || segment >= totalSegments) {
      throw new Error(`Segment ${segment} must be between 0 and ${totalSegments - 1}`);
    }
    if (totalSegments < 1 || totalSegments > 1000000) {
      throw new Error('TotalSegments must be between 1 and 1,000,000');
    }
    
    this.options.Segment = segment;
    this.options.TotalSegments = totalSegments;
    return this;
  }

  // Reuse configuration methods from QueryBuilder
  usingIndex(indexName: IndexNames<TConfig>): this {
    this.indexName = indexName as string;
    return this;
  }

  consistentRead(enabled = true): this {
    this.options.ConsistentRead = enabled;
    return this;
  }

  limit(count: number): this {
    if (count <= 0) {
      throw new Error('Limit must be greater than 0');
    }
    this.options.Limit = count;
    return this;
  }

  // Build request using AWS SDK's ScanCommandInput type
  private buildRequest(): ScanCommandInput {
    const request: ScanCommandInput = {
      TableName: this.config.tableName
    };

    // Apply options
    if (this.options.ConsistentRead !== undefined) {
      request.ConsistentRead = this.options.ConsistentRead;
    }
    if (this.options.Limit !== undefined) {
      request.Limit = this.options.Limit;
    }
    if (this.options.Segment !== undefined) {
      request.Segment = this.options.Segment;
    }
    if (this.options.TotalSegments !== undefined) {
      request.TotalSegments = this.options.TotalSegments;
    }
    // ... other options

    if (this.indexName) {
      request.IndexName = this.indexName;
    }

    // Build filter expression (no key conditions for scans)
    if (this.filterConditions.length > 0) {
      const filterExpression = ScanExpressions.buildFilterExpression(this.filterConditions);
      if (filterExpression.expression) {
        request.FilterExpression = filterExpression.expression;
        
        if (Object.keys(filterExpression.attributeNames).length > 0) {
          request.ExpressionAttributeNames = filterExpression.attributeNames;
        }
        
        if (Object.keys(filterExpression.attributeValues).length > 0) {
          request.ExpressionAttributeValues = filterExpression.attributeValues;
        }
      }
    }

    return request;
  }

  // Execution with proper error handling
  async execWithPagination(lastEvaluatedKey?: Record<string, any>): Promise<ScanResult<z.infer<TSchema>>> {
    const request = this.buildRequest();

    if (lastEvaluatedKey) {
      request.ExclusiveStartKey = lastEvaluatedKey;
    }

    try {
      const response = await this.client.scan(request);

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
      throw new Error(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Reuse validation and utility methods from QueryBuilder
  private validateAndTransform(item: any): z.infer<TSchema> {
    try {
      return this.config.schema.parse(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation failed: ${error.issues.map(i => i.message).join(', ')}`);
      }
      throw error;
    }
  }

  private isStringField(fieldName: SchemaKeys<TSchema>): boolean {
    // Reuse implementation from QueryBuilder
    try {
      const schemaShape = this.config.schema.shape;
      const field = schemaShape[fieldName as keyof typeof schemaShape];

      if (!field || typeof field._def !== 'object') {
        return false;
      }

      return field._def.typeName === 'ZodString';
    } catch {
      return false;
    }
  }

  private getExistingValueKeys(): string[] {
    const filterExpr = ScanExpressions.buildFilterExpression(this.filterConditions);
    return Object.keys(filterExpr.attributeValues);
  }
}
```

### 2. ScanConditions and ScanExpressions

**Strategy**: Reuse existing condition and expression classes from QueryBuilder:

```typescript
// src/scan/ScanConditions.ts
export {
  FilterConditions,
  StringFilterConditions
} from '../query/QueryConditions.js';

// src/scan/ScanExpressions.ts  
export {
  QueryExpressions as ScanExpressions
} from '../query/QueryExpressions.js';
```

**Benefits**:
- **Code reuse**: Avoid duplicating condition logic
- **Consistency**: Same operators and behavior across Query and Scan
- **Maintainability**: Single source of truth for condition building
- **Type safety**: Existing type-aware operators work identically

### 3. AWS SDK Integration Benefits

Using `ScanCommandInput` directly provides the same advantages as QueryBuilder:

1. **Type Safety**: Full TypeScript support for all DynamoDB scan parameters
2. **Future Compatibility**: Automatically supports new AWS SDK features
3. **Reduced Maintenance**: No need to manually maintain request object types
4. **IDE Support**: IntelliSense for all valid scan parameters
5. **Validation**: AWS SDK handles parameter validation internally

```typescript
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';

// ScanCommandInput provides these typed properties with native value support:
interface ScanCommandInput {
  TableName: string;
  IndexName?: string;
  FilterExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>; // Native JS values!
  ConsistentRead?: boolean;
  Limit?: number;
  ExclusiveStartKey?: Record<string, NativeAttributeValue>; // Native JS values!
  ProjectionExpression?: string;
  ReturnConsumedCapacity?: string;
  Segment?: number;              // Parallel scan support
  TotalSegments?: number;        // Parallel scan support
  // ... and more
}
```

## Integration with Model Class

### Model.scan() Method

```typescript
export class Model<TSchema, THashKey, TRangeKey> {
  // Existing methods...

  scan(): ScanBuilder<TSchema, TConfig> {
    return new ScanBuilder(this.client, this.config);
  }
}
```

### Key Benefits of the Simple Approach

1. **No Parameters**: Scans don't require key values (unlike queries)
2. **Flexible Filtering**: Any combination of fields can be filtered
3. **Index Support**: Works seamlessly with Global Secondary Indexes
4. **Type Safety**: Full TypeScript support with schema validation

```typescript
// Basic scan
const allUsers = await User.scan().exec();

// Filtered scan
const activeUsers = await User.scan()
  .filter('status').eq('active')
  .filter('age').gte(18)
  .exec();

// Index scan
const recentUsers = await User.scan()
  .usingIndex('CreatedAtIndex')
  .filter('createdAt').gte('2023-01-01')
  .exec();

// Parallel scan
const segment0 = await User.scan()
  .segments(0, 4)
  .filter('status').eq('active')
  .exec();
```

## Parallel Scan Implementation

### Parallel Scan Strategy

```typescript
// Helper function for parallel scanning
export async function parallelScan<T>(
  model: Model<any, any, any>,
  totalSegments: number,
  filterBuilder?: (scan: ScanBuilder<any, any>) => ScanBuilder<any, any>
): Promise<T[]> {
  const segments = Array.from({ length: totalSegments }, (_, i) => i);
  
  const scanPromises = segments.map(segment => {
    let scanBuilder = model.scan().segments(segment, totalSegments);
    
    if (filterBuilder) {
      scanBuilder = filterBuilder(scanBuilder);
    }
    
    return scanBuilder.exec();
  });

  const results = await Promise.all(scanPromises);
  return results.flat();
}

// Usage
const allActiveUsers = await parallelScan(
  User,
  4, // 4 parallel segments
  scan => scan.filter('status').eq('active')
);
```

### Parallel Scan Benefits

1. **Performance**: Faster scanning of large tables
2. **Throughput**: Better utilization of provisioned capacity
3. **Concurrency**: Multiple segments scan in parallel
4. **Scalability**: Can adjust segment count based on table size

## Performance Considerations

### Scan vs Query Performance

| Operation | Use Case | Performance | Cost |
|-----------|----------|-------------|------|
| **Query** | Known keys | Fast, targeted | Low |
| **Scan** | Unknown keys, filters | Slow, full table | High |
| **Parallel Scan** | Large tables, high throughput | Faster than single scan | High |

### Scan Optimization Strategies

1. **Use Filters Early**: Apply filters to reduce data transfer
2. **Limit Results**: Use `limit()` to control response size
3. **Projection**: Use `projectionExpression()` to limit attributes
4. **Parallel Segments**: Use parallel scanning for large tables
5. **Consistent Read**: Only use when necessary (costs more)

## Error Handling

### Custom Errors

```typescript
export class ScanValidationError extends Error {
  constructor(message: string, public field: string) {
    super(`Scan validation error on field '${field}': ${message}`);
  }
}

export class ParallelScanError extends Error {
  constructor(message: string, public segment: number) {
    super(`Parallel scan error on segment ${segment}: ${message}`);
  }
}
```

### Error Scenarios

1. **Validation Errors**: Invalid field names or values
2. **AWS Errors**: Capacity exceeded, table not found
3. **Parallel Scan Errors**: Invalid segment configuration
4. **Schema Validation**: Result doesn't match Zod schema

## Testing Strategy

### Unit Tests

```typescript
describe('ScanBuilder', () => {
  it('should build basic scan request', () => {
    const scan = new ScanBuilder(client, config);
    const request = scan.buildRequest();
    expect(request.TableName).toBe('users');
  });

  it('should handle filter conditions', () => {
    const scan = new ScanBuilder(client, config)
      .filter('status').eq('active')
      .filter('age').gte(18);
    
    const request = scan.buildRequest();
    expect(request.FilterExpression).toBe('(#status = :status) AND (#age >= :age)');
  });

  it('should handle parallel scan configuration', () => {
    const scan = new ScanBuilder(client, config)
      .segments(0, 4);
    
    const request = scan.buildRequest();
    expect(request.Segment).toBe(0);
    expect(request.TotalSegments).toBe(4);
  });
});
```

### Integration Tests

```typescript
describe('ScanBuilder Integration', () => {
  it('should scan table with filters', async () => {
    const users = await User.scan()
      .filter('status').eq('active')
      .limit(10)
      .exec();
    
    expect(users).toHaveLength(10);
    expect(users.every(u => u.status === 'active')).toBe(true);
  });

  it('should perform parallel scan', async () => {
    const results = await parallelScan(User, 4, scan => 
      scan.filter('status').eq('active')
    );
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(u => u.status === 'active')).toBe(true);
  });
});
```

## Implementation Phases

### Phase 1: Core ScanBuilder Implementation
- [x] Plan design and architecture
- [ ] Create `ScanBuilder` class with basic functionality
- [ ] Implement `filter()` method with condition building
- [ ] Add `exec()` and `execWithPagination()` methods
- [ ] Integrate with `Model` class

### Phase 2: Advanced Features
- [ ] Add `segments()` method for parallel scanning
- [ ] Implement `stream()` method for large datasets
- [ ] Add `usingIndex()` support with type safety
- [ ] Add all configuration methods (limit, consistentRead, etc.)

### Phase 3: Testing and Optimization
- [ ] Write comprehensive unit tests
- [ ] Add integration tests with DynamoDB
- [ ] Performance testing and optimization
- [ ] Add parallel scan helper functions

### Phase 4: Documentation and Examples
- [ ] Update CLAUDE.md with ScanBuilder documentation
- [ ] Create scan demo application
- [ ] Add performance comparison examples
- [ ] Document best practices

## Key Design Decisions

### 1. Reuse QueryBuilder Components
**Decision**: Reuse `FilterConditions` and `QueryExpressions` from QueryBuilder
**Rationale**: 
- Consistent API across Query and Scan operations
- Reduces code duplication and maintenance burden
- Same type safety and validation logic

### 2. No Key Conditions
**Decision**: Only `filter()` method, no `where()` method
**Rationale**: 
- Scans don't use `KeyConditionExpression`
- All conditions are filters in DynamoDB scans
- Simpler API with fewer concepts

### 3. Parallel Scan Support
**Decision**: Include `segments()` method for parallel scanning
**Rationale**: 
- Essential for large table performance
- Native DynamoDB feature
- Provides significant performance benefits

### 4. AWS SDK v3 Integration
**Decision**: Use `ScanCommandInput` and native values
**Rationale**: 
- Consistent with QueryBuilder approach
- Type safety and future compatibility
- Simplified value handling

## Benefits of This Approach

### 1. **Consistency with QueryBuilder**
- Same method naming and behavior
- Reused condition building logic
- Consistent error handling

### 2. **Type Safety**
- Full TypeScript support with Zod validation
- Schema-aware field validation
- Compile-time index name validation

### 3. **Performance Features**
- Parallel scanning for large tables
- Streaming for memory efficiency
- Efficient expression building

### 4. **Developer Experience**
- Intuitive fluent API
- Comprehensive error messages
- Full IDE support with IntelliSense

## Future Enhancements

### 1. **Advanced Parallel Scanning**
- Automatic segment optimization based on table size
- Dynamic segment count adjustment
- Parallel scan result aggregation utilities

### 2. **Performance Monitoring**
- Scan operation metrics and timing
- Capacity consumption tracking
- Performance comparison tools

### 3. **Query Optimization**
- Automatic filter optimization
- Scan vs Query recommendation engine
- Performance analysis tools

### 4. **Caching Integration**
- Optional result caching layer
- Smart cache invalidation
- Cache warming strategies

---

**📋 DOCUMENT STATUS: COMPREHENSIVE PLAN COMPLETE ✅**  
**🎯 READY FOR IMPLEMENTATION**  
**📅 CREATED: Based on proven QueryBuilder architecture**

## Summary

This ScanBuilder implementation plan provides:

1. **🏗️ Proven Architecture**: Based on successful QueryBuilder pattern
2. **🔒 Type Safety**: Full TypeScript and Zod integration
3. **⚡ Performance**: Parallel scanning and streaming support
4. **🔄 Code Reuse**: Leverages existing QueryBuilder components
5. **📖 Developer Experience**: Intuitive API with comprehensive documentation

The plan focuses on reusing the proven QueryBuilder architecture while adding scan-specific features like parallel scanning. This approach ensures consistency, reduces implementation time, and provides a robust foundation for DynamoDB table scanning operations.