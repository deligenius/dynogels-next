# Dynogels TypeScript Migration Plan

## Overview

This plan outlines the migration of the legacy JavaScript dynogels library to a modern, type-safe TypeScript implementation while maintaining backward compatibility and the existing API surface.

## Goals

- **Type Safety**: Full TypeScript support with strong typing
- **Modern Dependencies**: AWS SDK v3, Zod validation, ESM modules
- **API Compatibility**: Maintain existing dynogels API for seamless migration
- **Performance**: Improved performance with modern JavaScript features
- **Developer Experience**: Better IntelliSense, compile-time error checking, and ergonomic APIs

## Current State Analysis

### Legacy Library Structure
```
lib/
├── index.js          # Main entry point and model factory
├── table.js          # Core Table class with CRUD operations  
├── schema.js         # Joi-based schema validation
├── item.js           # Item class for individual records
├── query.js          # Query builder for fluent queries
├── scan.js           # Scan operations
├── batch.js          # Batch operations (getItems, batchGetItems)
├── serializer.js     # Data serialization/deserialization
├── expressions.js    # DynamoDB expression handling
├── parallelScan.js   # Parallel scan implementation
└── createTables.js   # Table creation utilities
```

### Current lib_new Implementation
- Basic Model class with CRUD operations
- Zod schema validation
- AWS SDK v3 integration
- Missing: Query builder, Scan, Batch operations, Expression handling

## Migration Strategy

### Phase 1: Core Foundation (Weeks 1-2)

#### 1.1 Project Structure Setup
```
src/
├── index.ts                 # Main entry point
├── types/                   # TypeScript type definitions
│   ├── schema.ts           # Schema and validation types
│   ├── table.ts            # Table configuration types
│   ├── query.ts            # Query builder types
│   └── dynogels.ts         # Main API types
├── core/                   # Core functionality
│   ├── Table.ts            # Enhanced Table class
│   ├── Schema.ts           # Zod-based schema system
│   ├── Item.ts             # Item class with type safety
│   └── Model.ts            # Model factory
├── operations/             # DynamoDB operations
│   ├── Query.ts            # Query builder
│   ├── Scan.ts             # Scan operations
│   ├── Batch.ts            # Batch operations
│   └── Expressions.ts      # Expression handling
├── utils/                  # Utilities
│   ├── serializer.ts       # Data serialization
│   ├── validators.ts       # Custom validation helpers
│   └── aws.ts              # AWS client configuration
└── __tests__/              # Test suite
    ├── unit/
    └── integration/
```

#### 1.2 Package Configuration
```json
{
  "name": "dynogels-next",
  "version": "10.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:unit": "vitest run src/__tests__/unit",
    "test:integration": "vitest run src/__tests__/integration",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.609.0",
    "@aws-sdk/lib-dynamodb": "^3.609.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@biomejs/biome": "^1.8.0"
  }
}
```

### Phase 2: Schema and Validation System (Weeks 2-3)

#### 2.1 Zod Schema Types
Replace Joi with Zod while maintaining similar functionality:

```typescript
import { z } from 'zod';

// Equivalent to dynogels.types
export const DynogelsTypes = {
  stringSet: () => z.array(z.string()).min(1),
  numberSet: () => z.array(z.number()).min(1),
  binarySet: () => z.array(z.instanceof(Uint8Array)).min(1),
  uuid: () => z.string().uuid().default(() => crypto.randomUUID()),
  timeUUID: () => z.string().uuid(), // Custom implementation needed
} as const;

// Schema configuration type
export interface SchemaConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName?: string | (() => string);
  timestamps?: boolean;
  createdAt?: string | boolean;
  updatedAt?: string | boolean;
  indexes?: SecondaryIndex[];
  validation?: {
    allowUnknown?: boolean;
    abortEarly?: boolean;
  };
}

export interface SecondaryIndex {
  name: string;
  type: 'local' | 'global';
  hashKey: string;
  rangeKey?: string;
  projection?: {
    ProjectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    NonKeyAttributes?: string[];
  };
  readCapacity?: number;
  writeCapacity?: number;
}
```

#### 2.2 Schema Class Implementation
```typescript
export class Schema<T extends z.ZodObject<any>> {
  public readonly zodSchema: T;
  public readonly config: SchemaConfig<T>;
  
  constructor(config: SchemaConfig<T>) {
    this.config = config;
    this.zodSchema = this.enhanceSchemaWithTimestamps(config.schema);
  }
  
  private enhanceSchemaWithTimestamps(schema: T): T {
    if (!this.config.timestamps) return schema;
    
    const timestampFields: Record<string, z.ZodDate> = {};
    
    if (this.config.createdAt !== false) {
      const fieldName = typeof this.config.createdAt === 'string' 
        ? this.config.createdAt 
        : 'createdAt';
      timestampFields[fieldName] = z.date();
    }
    
    if (this.config.updatedAt !== false) {
      const fieldName = typeof this.config.updatedAt === 'string' 
        ? this.config.updatedAt 
        : 'updatedAt';
      timestampFields[fieldName] = z.date();
    }
    
    return schema.extend(timestampFields) as T;
  }
  
  validate(data: unknown) {
    return this.zodSchema.safeParse(data);
  }
  
  applyDefaults(data: Partial<z.infer<T>>): z.infer<T> {
    return this.zodSchema.parse(data);
  }
}
```

### Phase 3: Enhanced Table and Model Classes (Weeks 3-4)

#### 3.1 Type-Safe Table Class
```typescript
export class Table<
  TSchema extends z.ZodObject<any>,
  TType = z.infer<TSchema>,
  THashKey extends keyof TType = keyof TType,
  TRangeKey extends keyof TType | undefined = undefined
> {
  private docClient: DynamoDBDocument;
  private schema: Schema<TSchema>;
  private tableName: string;
  
  constructor(
    docClient: DynamoDBDocument,
    schema: Schema<TSchema>,
    tableName: string
  ) {
    this.docClient = docClient;
    this.schema = schema;
    this.tableName = tableName;
  }
  
  async create(item: TType, options?: CreateOptions): Promise<Item<TType>> {
    const validatedItem = this.schema.applyDefaults(item);
    
    // Add timestamps if enabled
    const itemWithTimestamps = this.addTimestamps(validatedItem, 'create');
    
    await this.docClient.put({
      TableName: this.tableName,
      Item: itemWithTimestamps,
      ...this.buildConditionExpression(options),
    });
    
    return new Item(itemWithTimestamps, this);
  }
  
  async get(
    key: KeyType<TType, THashKey, TRangeKey>,
    options?: GetOptions
  ): Promise<Item<TType> | null> {
    const result = await this.docClient.get({
      TableName: this.tableName,
      Key: key,
      ...options,
    });
    
    if (!result.Item) return null;
    
    const validatedItem = this.schema.validate(result.Item);
    if (!validatedItem.success) {
      throw new Error(`Invalid item data: ${validatedItem.error.message}`);
    }
    
    return new Item(validatedItem.data, this);
  }
  
  query(hashKey: TType[THashKey]): Query<TType> {
    return new Query(this.docClient, this.tableName, this.schema, hashKey);
  }
  
  scan(): Scan<TType> {
    return new Scan(this.docClient, this.tableName, this.schema);
  }
  
  // ... other methods
}
```

#### 3.2 Model Factory with Type Inference
```typescript
export class DynogelsModel<T extends z.ZodObject<any>> {
  private table: Table<T>;
  
  constructor(table: Table<T>) {
    this.table = table;
  }
  
  // Static methods that delegate to table
  get = this.table.get.bind(this.table);
  create = this.table.create.bind(this.table);
  update = this.table.update.bind(this.table);
  destroy = this.table.destroy.bind(this.table);
  query = this.table.query.bind(this.table);
  scan = this.table.scan.bind(this.table);
  
  // Table management
  createTable = this.table.createTable.bind(this.table);
  deleteTable = this.table.deleteTable.bind(this.table);
  describeTable = this.table.describeTable.bind(this.table);
}
```

### Phase 4: Query and Scan Builders (Weeks 4-5)

#### 4.1 Type-Safe Query Builder
```typescript
export class Query<T> {
  private conditions: QueryCondition[] = [];
  private filters: FilterCondition[] = [];
  private indexName?: string;
  private projectionExpression?: string;
  private scanIndexForward: boolean = true;
  private limitValue?: number;
  private startKey?: Record<string, any>;
  
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>,
    private hashKeyValue: any
  ) {}
  
  where<K extends keyof T>(field: K): QueryConditionBuilder<T[K]> {
    return new QueryConditionBuilder(field, this);
  }
  
  filter<K extends keyof T>(field: K): FilterConditionBuilder<T[K]> {
    return new FilterConditionBuilder(field, this);
  }
  
  usingIndex(indexName: string): this {
    this.indexName = indexName;
    return this;
  }
  
  attributes<K extends keyof T>(attrs: K[]): this {
    this.projectionExpression = attrs.join(', ');
    return this;
  }
  
  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }
  
  ascending(): this {
    this.scanIndexForward = true;
    return this;
  }
  
  descending(): this {
    this.scanIndexForward = false;
    return this;
  }
  
  startKey(key: Record<string, any>): this {
    this.startKey = key;
    return this;
  }
  
  async exec(): Promise<QueryResult<T>> {
    const params = this.buildQueryParams();
    const result = await this.docClient.query(params);
    
    return {
      Items: result.Items?.map(item => new Item(item, this.table)) || [],
      Count: result.Count || 0,
      ScannedCount: result.ScannedCount || 0,
      LastEvaluatedKey: result.LastEvaluatedKey,
    };
  }
  
  private buildQueryParams(): QueryInput {
    // Build DynamoDB query parameters from fluent API
    // ... implementation
  }
}
```

#### 4.2 Condition Builders
```typescript
export class QueryConditionBuilder<T> {
  constructor(
    private field: string,
    private query: Query<any>
  ) {}
  
  equals(value: T): Query<any> {
    this.query.addCondition(this.field, 'EQ', value);
    return this.query;
  }
  
  beginsWith(value: string): Query<any> {
    this.query.addCondition(this.field, 'BEGINS_WITH', value);
    return this.query;
  }
  
  between(start: T, end: T): Query<any> {
    this.query.addCondition(this.field, 'BETWEEN', [start, end]);
    return this.query;
  }
  
  // ... other condition methods
}
```

### Phase 5: Advanced Features (Weeks 5-6)

#### 5.1 Expression Handling
```typescript
export class ExpressionBuilder {
  private updateExpressions: string[] = [];
  private conditionExpressions: string[] = [];
  private attributeNames: Record<string, string> = {};
  private attributeValues: Record<string, any> = {};
  
  set(field: string, value: any): this {
    const nameKey = `#${field}`;
    const valueKey = `:${field}`;
    
    this.updateExpressions.push(`${nameKey} = ${valueKey}`);
    this.attributeNames[nameKey] = field;
    this.attributeValues[valueKey] = value;
    
    return this;
  }
  
  add(field: string, value: any): this {
    // Handle ADD operations for numbers and sets
    return this;
  }
  
  condition(expression: string, values: Record<string, any>): this {
    this.conditionExpressions.push(expression);
    Object.assign(this.attributeValues, values);
    return this;
  }
  
  build() {
    return {
      UpdateExpression: this.updateExpressions.length > 0 
        ? `SET ${this.updateExpressions.join(', ')}` 
        : undefined,
      ConditionExpression: this.conditionExpressions.length > 0
        ? this.conditionExpressions.join(' AND ')
        : undefined,
      ExpressionAttributeNames: Object.keys(this.attributeNames).length > 0 
        ? this.attributeNames 
        : undefined,
      ExpressionAttributeValues: Object.keys(this.attributeValues).length > 0 
        ? this.attributeValues 
        : undefined,
    };
  }
}
```

#### 5.2 Batch Operations
```typescript
export class BatchOperations<T> {
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>
  ) {}
  
  async getItems(keys: any[]): Promise<T[]> {
    const chunks = this.chunkArray(keys, 100); // DynamoDB batch limit
    const results: T[] = [];
    
    for (const chunk of chunks) {
      const params = {
        RequestItems: {
          [this.tableName]: {
            Keys: chunk,
          },
        },
      };
      
      const result = await this.docClient.batchGet(params);
      const items = result.Responses?.[this.tableName] || [];
      
      results.push(...items.map(item => this.schema.validate(item).data));
    }
    
    return results;
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
```

### Phase 6: Migration and Compatibility (Weeks 6-7)

#### 6.1 Legacy API Compatibility Layer
```typescript
// Provide backward compatibility for existing code
export function createLegacyWrapper<T extends z.ZodObject<any>>(
  model: DynogelsModel<T>
) {
  return {
    // Legacy callback-style methods
    get(key: any, callback?: (err: any, result?: any) => void) {
      if (callback) {
        model.get(key)
          .then(result => callback(null, result))
          .catch(err => callback(err));
      } else {
        return model.get(key);
      }
    },
    
    create(item: any, callback?: (err: any, result?: any) => void) {
      if (callback) {
        model.create(item)
          .then(result => callback(null, result))
          .catch(err => callback(err));
      } else {
        return model.create(item);
      }
    },
    
    // ... other legacy methods
  };
}
```

#### 6.2 Migration Guide
Create comprehensive migration documentation:

1. **Breaking Changes**: Document API differences
2. **Migration Scripts**: Automated conversion tools
3. **Examples**: Side-by-side comparisons
4. **Type Definitions**: How to add types to existing code

### Phase 7: Testing and Documentation (Weeks 7-8)

#### 7.1 Test Suite
```typescript
// Example test structure
describe('Model Operations', () => {
  it('should create items with type safety', async () => {
    const UserSchema = z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
      age: z.number().optional(),
    });
    
    const User = dynogels.define('User', {
      hashKey: 'id',
      schema: UserSchema,
      timestamps: true,
    });
    
    const user = await User.create({
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
    });
    
    expect(user.get('name')).toBe('John Doe');
    expect(user.get('createdAt')).toBeInstanceOf(Date);
  });
});
```

#### 7.2 Documentation
- **API Reference**: Complete TypeScript API documentation
- **Migration Guide**: Step-by-step migration instructions
- **Examples**: TypeScript examples for all features
- **Best Practices**: Recommended patterns and usage

## Implementation Timeline

| Week | Phase | Deliverables |
|------|-------|-------------|
| 1-2  | Core Foundation | Project setup, types, basic Table class |
| 2-3  | Schema System | Zod integration, validation, Schema class |
| 3-4  | Enhanced Models | Type-safe Model factory, CRUD operations |
| 4-5  | Query/Scan | Fluent query builder, scan operations |
| 5-6  | Advanced Features | Expressions, batch operations, indexes |
| 6-7  | Compatibility | Legacy wrapper, migration tools |
| 7-8  | Testing/Docs | Complete test suite, documentation |

## Success Criteria

- [ ] 100% API compatibility with legacy dynogels
- [ ] Full TypeScript support with strong typing
- [ ] Comprehensive test coverage (>90%)
- [ ] Migration guide and tooling
- [ ] Performance benchmarks showing improvement
- [ ] Zero breaking changes for basic usage

## Risk Mitigation

1. **Type Complexity**: Start with simple types, gradually add complexity
2. **AWS SDK Changes**: Use stable AWS SDK v3 APIs, add abstraction layer
3. **Performance**: Continuous benchmarking during development
4. **Breaking Changes**: Extensive testing with real-world codebases

## Future Enhancements

- **Streaming APIs**: Async iterators for large result sets
- **Connection Pooling**: Optimized connection management
- **Caching Layer**: Optional caching integration
- **Schema Evolution**: Tools for schema versioning and migration
- **Observability**: Built-in metrics and tracing support