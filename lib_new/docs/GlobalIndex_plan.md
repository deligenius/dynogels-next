# Global Secondary Index (GSI) Support Plan

## Overview

This document outlines the implementation plan for adding comprehensive Global Secondary Index (GSI) support to the existing TypeScript Model and QueryBuilder architecture. This builds upon the completed QueryBuilder implementation and Model system.

## Current Architecture Analysis

### Existing Foundation ✅
- **ModelFactory**: Creates Model instances with schema validation
- **Model Class**: CRUD operations with type safety
- **QueryBuilder**: Fluent API with native AWS SDK v3 integration
- **Type System**: Full TypeScript support with Zod schema inference
- **Expression Building**: Automatic KeyConditionExpression and FilterExpression generation

### Current GSI Support Status
- ✅ **Basic GSI Querying**: `usingIndex(indexName)` method exists
- ❌ **GSI Definition**: No schema-based GSI configuration
- ❌ **GSI Creation**: No automatic GSI table creation
- ❌ **GSI Validation**: No query validation against GSI key schema
- ❌ **GSI Type Safety**: No compile-time GSI key validation

## Global Secondary Index Design Goals

### 1. Schema-First GSI Definition ✅ NEW
- Define GSIs as part of model configuration
- Type-safe GSI key specification
- Automatic GSI creation during table setup
- Runtime validation of GSI queries

### 2. Enhanced QueryBuilder Integration ✅ NEW
- Automatic GSI key validation when using `usingIndex()`
- Type-aware GSI query building
- GSI-specific error messages
- Optimized query routing

### 3. GSI Management ✅ NEW
- Create GSIs with table creation
- Update GSI throughput settings
- Delete GSIs during table cleanup
- GSI status monitoring

### 4. Advanced GSI Features ✅ NEW
- Projection expression optimization for GSIs
- GSI query cost estimation
- Cross-region GSI support
- GSI backfill monitoring

## Implementation Architecture

### Phase 1: GSI Configuration System

#### 1.1 GSI Configuration Types

```typescript
// lib_new/src/types/GlobalIndex.ts
import { z } from 'zod';
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

export interface GSIConfig<TSchema extends z.ZodObject<any>> {
  indexName: string;
  hashKey: keyof z.infer<TSchema>;
  rangeKey?: keyof z.infer<TSchema>;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  projectedAttributes?: (keyof z.infer<TSchema>)[];
  throughput?: {
    read: number;
    write: number;
  };
}

export interface LSIConfig<TSchema extends z.ZodObject<any>> {
  indexName: string;
  rangeKey: keyof z.infer<TSchema>;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  projectedAttributes?: (keyof z.infer<TSchema>)[];
}

// Enhanced ModelConfig with GSI support
export interface ModelConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName: string;
  timestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
  ttl?: {
    attribute: keyof z.infer<T>;
  };
  globalSecondaryIndexes?: GSIConfig<T>[];
  localSecondaryIndexes?: LSIConfig<T>[];
}

// GSI query key types
export type GSIKey<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined = undefined
> = {
  [K in THashKey]: z.infer<TSchema>[K];
} & (TRangeKey extends keyof z.infer<TSchema>
  ? { [K in TRangeKey]: z.infer<TSchema>[K] }
  : {});

// Index information for runtime validation
export interface IndexInfo {
  name: string;
  type: 'GSI' | 'LSI';
  hashKey: string;
  rangeKey?: string;
  projectionType: string;
  projectedAttributes?: string[];
}
```

#### 1.2 Enhanced Model Configuration

```typescript
// lib_new/src/Model.ts - Enhanced constructor
export class Model<
  TSchema extends z.ZodObject<any>,
  TItem extends z.infer<TSchema> = z.infer<TSchema>,
  THashKey extends keyof TItem = keyof TItem,
  TRangeKey extends keyof TItem | undefined = undefined
> {
  private readonly indexMap: Map<string, IndexInfo>;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: ModelConfig<TSchema>
  ) {
    // Build index information map for runtime validation
    this.indexMap = this.buildIndexMap();
  }

  private buildIndexMap(): Map<string, IndexInfo> {
    const indexMap = new Map<string, IndexInfo>();

    // Add GSIs
    this.config.globalSecondaryIndexes?.forEach(gsi => {
      indexMap.set(gsi.indexName, {
        name: gsi.indexName,
        type: 'GSI',
        hashKey: String(gsi.hashKey),
        rangeKey: gsi.rangeKey ? String(gsi.rangeKey) : undefined,
        projectionType: gsi.projectionType,
        projectedAttributes: gsi.projectedAttributes?.map(String)
      });
    });

    // Add LSIs
    this.config.localSecondaryIndexes?.forEach(lsi => {
      indexMap.set(lsi.indexName, {
        name: lsi.indexName,
        type: 'LSI',
        hashKey: String(this.config.hashKey), // LSI uses table's hash key
        rangeKey: String(lsi.rangeKey),
        projectionType: lsi.projectionType,
        projectedAttributes: lsi.projectedAttributes?.map(String)
      });
    });

    return indexMap;
  }

  // Enhanced query method with GSI validation
  query(keyValues: Partial<z.infer<TSchema>>): QueryBuilder<TSchema, THashKey, TRangeKey> {
    return new QueryBuilder(this.client, this.config, keyValues, this.indexMap);
  }

  // GSI-specific query method for better type safety
  queryGSI<
    TGSIHashKey extends keyof TItem,
    TGSIRangeKey extends keyof TItem | undefined = undefined
  >(
    indexName: string,
    keyValues: GSIKey<TSchema, TGSIHashKey, TGSIRangeKey>
  ): QueryBuilder<TSchema, TGSIHashKey, TGSIRangeKey> {
    const indexInfo = this.indexMap.get(indexName);
    if (!indexInfo) {
      throw new Error(`Index '${indexName}' not found on table '${this.config.tableName}'`);
    }
    if (indexInfo.type !== 'GSI') {
      throw new Error(`Index '${indexName}' is not a Global Secondary Index`);
    }

    return new QueryBuilder(this.client, this.config, keyValues, this.indexMap)
      .usingIndex(indexName);
  }
}
```

### Phase 2: Enhanced QueryBuilder with GSI Validation

#### 2.1 GSI-Aware QueryBuilder

```typescript
// lib_new/src/query/QueryBuilder.ts - Enhanced with GSI support
export class QueryBuilder<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined
> {
  private indexName?: string;
  private currentIndexInfo?: IndexInfo;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: ModelConfig<TSchema> & {
      hashKey: THashKey;
      rangeKey?: TRangeKey;
    },
    private readonly keyValues: Partial<z.infer<TSchema>>,
    private readonly indexMap: Map<string, IndexInfo> // New parameter
  ) {
    super();
  }

  // Enhanced usingIndex with validation
  usingIndex(indexName: string): this {
    const indexInfo = this.indexMap.get(indexName);
    if (!indexInfo) {
      throw new IndexNotFoundError(indexName, this.config.tableName);
    }

    // Validate that provided keyValues match the index's key schema
    this.validateIndexKeys(indexInfo, this.keyValues);

    this.indexName = indexName;
    this.currentIndexInfo = indexInfo;
    return this;
  }

  // GSI key validation
  private validateIndexKeys(indexInfo: IndexInfo, keyValues: Partial<z.infer<TSchema>>): void {
    const providedKeys = Object.keys(keyValues);
    const requiredHashKey = indexInfo.hashKey;
    const optionalRangeKey = indexInfo.rangeKey;

    // Check if hash key is provided
    if (!providedKeys.includes(requiredHashKey)) {
      throw new GSIValidationError(
        `GSI '${indexInfo.name}' requires hash key '${requiredHashKey}' but it was not provided`,
        indexInfo.name
      );
    }

    // Validate that all provided keys are valid for this index
    const validKeys = [requiredHashKey];
    if (optionalRangeKey) {
      validKeys.push(optionalRangeKey);
    }

    const invalidKeys = providedKeys.filter(key => !validKeys.includes(key));
    if (invalidKeys.length > 0) {
      throw new GSIValidationError(
        `Keys [${invalidKeys.join(', ')}] are not valid for GSI '${indexInfo.name}'. Valid keys are: [${validKeys.join(', ')}]`,
        indexInfo.name
      );
    }
  }

  // Enhanced projection validation
  private validateProjectedAttributes(requestedAttributes?: string[]): void {
    if (!this.currentIndexInfo || !requestedAttributes) {
      return;
    }

    const { projectionType, projectedAttributes } = this.currentIndexInfo;

    if (projectionType === 'ALL') {
      return; // All attributes are available
    }

    if (projectionType === 'KEYS_ONLY') {
      const keyAttributes = [this.currentIndexInfo.hashKey];
      if (this.currentIndexInfo.rangeKey) {
        keyAttributes.push(this.currentIndexInfo.rangeKey);
      }
      
      const invalidAttributes = requestedAttributes.filter(
        attr => !keyAttributes.includes(attr)
      );
      
      if (invalidAttributes.length > 0) {
        throw new GSIValidationError(
          `Attributes [${invalidAttributes.join(', ')}] are not projected in KEYS_ONLY GSI '${this.currentIndexInfo.name}'`,
          this.currentIndexInfo.name
        );
      }
    }

    if (projectionType === 'INCLUDE' && projectedAttributes) {
      const availableAttributes = [
        this.currentIndexInfo.hashKey,
        ...(this.currentIndexInfo.rangeKey ? [this.currentIndexInfo.rangeKey] : []),
        ...projectedAttributes
      ];
      
      const invalidAttributes = requestedAttributes.filter(
        attr => !availableAttributes.includes(attr)
      );
      
      if (invalidAttributes.length > 0) {
        throw new GSIValidationError(
          `Attributes [${invalidAttributes.join(', ')}] are not projected in GSI '${this.currentIndexInfo.name}'. Available attributes: [${availableAttributes.join(', ')}]`,
          this.currentIndexInfo.name
        );
      }
    }
  }

  // Enhanced projectionExpression with GSI validation
  projectionExpression(expression: string): this {
    // Parse projection expression to extract attribute names
    const attributeNames = this.parseProjectionExpression(expression);
    this.validateProjectedAttributes(attributeNames);
    
    this.options.ProjectionExpression = expression;
    return this;
  }

  private parseProjectionExpression(expression: string): string[] {
    // Simple parser for projection expressions
    // Handles: "attr1, attr2, #attr3" format
    return expression
      .split(',')
      .map(attr => attr.trim().replace(/^#/, ''))
      .filter(attr => attr.length > 0);
  }
}
```

#### 2.2 GSI-Specific Error Classes

```typescript
// lib_new/src/errors/GSIError.ts
export class GSIError extends Error {
  constructor(message: string, public indexName: string) {
    super(message);
    this.name = 'GSIError';
  }
}

export class GSIValidationError extends GSIError {
  constructor(message: string, indexName: string) {
    super(message, indexName);
    this.name = 'GSIValidationError';
  }
}

export class IndexNotFoundError extends GSIError {
  constructor(indexName: string, tableName: string) {
    super(`Index '${indexName}' not found on table '${tableName}'`, indexName);
    this.name = 'IndexNotFoundError';
  }
}

export class ProjectionError extends GSIError {
  constructor(message: string, indexName: string, public requestedAttributes: string[]) {
    super(message, indexName);
    this.name = 'ProjectionError';
  }
}
```

### Phase 3: GSI Table Management

#### 3.1 Enhanced TableManager with GSI Support

```typescript
// lib_new/src/TableManager.ts - Enhanced with GSI support
import { 
  CreateTableCommand, 
  UpdateTableCommand,
  type GlobalSecondaryIndex,
  type LocalSecondaryIndex,
  type Projection
} from '@aws-sdk/client-dynamodb';

export class TableManager {
  constructor(private readonly client: DynamoDBClient) {}

  async createTable<TSchema extends z.ZodObject<any>>(
    modelOrConfig: Model<TSchema> | ModelConfig<TSchema>,
    throughput: { read: number; write: number } = { read: 1, write: 1 }
  ): Promise<void> {
    const config = this.extractConfig(modelOrConfig);
    
    try {
      const command = new CreateTableCommand({
        TableName: config.tableName,
        KeySchema: this.buildKeySchema(config),
        AttributeDefinitions: this.buildAttributeDefinitions(config),
        ProvisionedThroughput: {
          ReadCapacityUnits: throughput.read,
          WriteCapacityUnits: throughput.write,
        },
        GlobalSecondaryIndexes: this.buildGlobalSecondaryIndexes(config),
        LocalSecondaryIndexes: this.buildLocalSecondaryIndexes(config),
      });

      await this.client.send(command);
    } catch (error) {
      if (error instanceof ResourceInUseException) {
        throw new ResourceInUseError(`Table ${config.tableName} already exists`);
      }
      throw error;
    }
  }

  private buildGlobalSecondaryIndexes<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ): GlobalSecondaryIndex[] | undefined {
    if (!config.globalSecondaryIndexes?.length) {
      return undefined;
    }

    return config.globalSecondaryIndexes.map(gsi => ({
      IndexName: gsi.indexName,
      KeySchema: [
        {
          AttributeName: String(gsi.hashKey),
          KeyType: 'HASH',
        },
        ...(gsi.rangeKey ? [{
          AttributeName: String(gsi.rangeKey),
          KeyType: 'RANGE' as const,
        }] : []),
      ],
      Projection: this.buildProjection(gsi.projectionType, gsi.projectedAttributes),
      ProvisionedThroughput: {
        ReadCapacityUnits: gsi.throughput?.read || 1,
        WriteCapacityUnits: gsi.throughput?.write || 1,
      },
    }));
  }

  private buildLocalSecondaryIndexes<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ): LocalSecondaryIndex[] | undefined {
    if (!config.localSecondaryIndexes?.length) {
      return undefined;
    }

    return config.localSecondaryIndexes.map(lsi => ({
      IndexName: lsi.indexName,
      KeySchema: [
        {
          AttributeName: String(config.hashKey), // LSI uses table's hash key
          KeyType: 'HASH',
        },
        {
          AttributeName: String(lsi.rangeKey),
          KeyType: 'RANGE',
        },
      ],
      Projection: this.buildProjection(lsi.projectionType, lsi.projectedAttributes),
    }));
  }

  private buildProjection(
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE',
    projectedAttributes?: (string | number | symbol)[]
  ): Projection {
    const projection: Projection = {
      ProjectionType: projectionType,
    };

    if (projectionType === 'INCLUDE' && projectedAttributes?.length) {
      projection.NonKeyAttributes = projectedAttributes.map(String);
    }

    return projection;
  }

  private buildAttributeDefinitions<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ) {
    const attributes = new Set<string>();
    
    // Add table keys
    attributes.add(String(config.hashKey));
    if (config.rangeKey) {
      attributes.add(String(config.rangeKey));
    }

    // Add GSI keys
    config.globalSecondaryIndexes?.forEach(gsi => {
      attributes.add(String(gsi.hashKey));
      if (gsi.rangeKey) {
        attributes.add(String(gsi.rangeKey));
      }
    });

    // Add LSI keys
    config.localSecondaryIndexes?.forEach(lsi => {
      attributes.add(String(lsi.rangeKey));
    });

    return Array.from(attributes).map(attr => ({
      AttributeName: attr,
      AttributeType: this.getAttributeType(config.schema.shape[attr]),
    }));
  }

  // GSI management methods
  async addGSI<TSchema extends z.ZodObject<any>>(
    tableName: string,
    gsiConfig: GSIConfig<TSchema>
  ): Promise<void> {
    const updateCommand = new UpdateTableCommand({
      TableName: tableName,
      GlobalSecondaryIndexUpdates: [{
        Create: {
          IndexName: gsiConfig.indexName,
          KeySchema: [
            {
              AttributeName: String(gsiConfig.hashKey),
              KeyType: 'HASH',
            },
            ...(gsiConfig.rangeKey ? [{
              AttributeName: String(gsiConfig.rangeKey),
              KeyType: 'RANGE' as const,
            }] : []),
          ],
          Projection: this.buildProjection(gsiConfig.projectionType, gsiConfig.projectedAttributes),
          ProvisionedThroughput: {
            ReadCapacityUnits: gsiConfig.throughput?.read || 1,
            WriteCapacityUnits: gsiConfig.throughput?.write || 1,
          },
        },
      }],
    });

    await this.client.send(updateCommand);
  }

  async removeGSI(tableName: string, indexName: string): Promise<void> {
    const updateCommand = new UpdateTableCommand({
      TableName: tableName,
      GlobalSecondaryIndexUpdates: [{
        Delete: {
          IndexName: indexName,
        },
      }],
    });

    await this.client.send(updateCommand);
  }
}
```

### Phase 4: Usage Examples and API Design

#### 4.1 GSI Model Definition

```typescript
// Example: User model with multiple GSIs
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ModelFactory } from './src/ModelFactory';

const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: z.enum(['active', 'inactive', 'suspended']),
  department: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastLoginAt: z.string().optional(),
  role: z.enum(['admin', 'user', 'manager']),
  region: z.string(),
  metadata: z.record(z.any()).optional(),
});

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true },
  globalSecondaryIndexes: [
    {
      indexName: 'EmailIndex',
      hashKey: 'email',
      projectionType: 'ALL',
      throughput: { read: 5, write: 5 },
    },
    {
      indexName: 'StatusDepartmentIndex',
      hashKey: 'status',
      rangeKey: 'department',
      projectionType: 'INCLUDE',
      projectedAttributes: ['email', 'role', 'lastLoginAt'],
      throughput: { read: 10, write: 5 },
    },
    {
      indexName: 'RegionStatusIndex',
      hashKey: 'region',
      rangeKey: 'status',
      projectionType: 'KEYS_ONLY',
      throughput: { read: 3, write: 3 },
    }
  ],
  localSecondaryIndexes: [
    {
      indexName: 'UserRoleIndex',
      rangeKey: 'role',
      projectionType: 'ALL',
    }
  ]
});
```

#### 4.2 GSI Query Examples

```typescript
// 1. Query by email (EmailIndex GSI)
const userByEmail = await User.queryGSI('EmailIndex', { 
  email: 'john@example.com' 
}).exec();

// 2. Query active users in engineering department (StatusDepartmentIndex GSI)
const activeEngineers = await User.queryGSI('StatusDepartmentIndex', {
  status: 'active',
  department: 'engineering'
}).exec();

// 3. Query active users in engineering with additional filters
const seniorActiveEngineers = await User.queryGSI('StatusDepartmentIndex', {
  status: 'active',
  department: 'engineering'
})
  .filter('role').eq('admin')
  .filter('lastLoginAt').gte('2024-01-01')
  .projectionExpression('email, role, lastLoginAt') // Safe - these are projected
  .exec();

// 4. Query by region with status range (RegionStatusIndex GSI)
const regionUsers = await User.queryGSI('RegionStatusIndex', { 
  region: 'us-west-2' 
})
  .where('status').in(['active', 'inactive'])
  .exec();

// 5. Using generic query method with automatic validation
const emailQuery = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex') // Validates that email is GSI hash key
  .exec();

// 6. Stream large GSI results
for await (const batch of User.queryGSI('StatusDepartmentIndex', {
  status: 'active'
}).stream()) {
  console.log(`Processing ${batch.length} active users`);
  // Process each batch efficiently
}

// 7. Paginated GSI query
let lastKey = undefined;
const allActiveUsers: User[] = [];

do {
  const result = await User.queryGSI('StatusDepartmentIndex', {
    status: 'active'
  })
    .startKey(lastKey)
    .limit(100)
    .execWithPagination();
  
  allActiveUsers.push(...result.items);
  lastKey = result.lastEvaluatedKey;
} while (lastKey);

// 8. LSI query (UserRoleIndex)
const adminUsers = await User.query({ id: 'some-id' })
  .where('role').eq('admin')
  .usingIndex('UserRoleIndex')
  .exec();
```

#### 4.3 Error Handling Examples

```typescript
try {
  // This will throw GSIValidationError
  await User.queryGSI('EmailIndex', { 
    status: 'active' // Wrong key - EmailIndex requires 'email' hash key
  }).exec();
} catch (error) {
  if (error instanceof GSIValidationError) {
    console.error(`GSI validation failed: ${error.message}`);
    console.error(`Index: ${error.indexName}`);
  }
}

try {
  // This will throw ProjectionError
  await User.queryGSI('RegionStatusIndex', { 
    region: 'us-west-2' 
  })
    .projectionExpression('metadata') // Not projected in KEYS_ONLY index
    .exec();
} catch (error) {
  if (error instanceof ProjectionError) {
    console.error(`Projection error: ${error.message}`);
    console.error(`Requested attributes: ${error.requestedAttributes}`);
  }
}
```

### Phase 5: Advanced GSI Features

#### 5.1 GSI Query Cost Estimation

```typescript
// lib_new/src/GSIOptimizer.ts
export class GSIOptimizer {
  static estimateQueryCost(indexInfo: IndexInfo, queryParams: any): {
    estimatedRCU: number;
    estimatedItemsScanned: number;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let estimatedRCU = 1; // Base cost
    
    // Analyze query pattern
    if (indexInfo.type === 'GSI' && indexInfo.projectionType === 'ALL') {
      estimatedRCU *= 2; // ALL projection costs more
      recommendations.push('Consider using INCLUDE projection to reduce costs');
    }
    
    if (!queryParams.limit) {
      recommendations.push('Consider adding a limit() to reduce scanned items');
    }
    
    return {
      estimatedRCU,
      estimatedItemsScanned: queryParams.limit || 1000,
      recommendations
    };
  }
}

// Usage in QueryBuilder
class QueryBuilder {
  estimateCost(): { estimatedRCU: number; recommendations: string[] } {
    if (!this.currentIndexInfo) {
      return { estimatedRCU: 1, recommendations: [] };
    }
    
    return GSIOptimizer.estimateQueryCost(this.currentIndexInfo, {
      limit: this.options.Limit,
      keyConditions: this.keyConditions.length,
      filterConditions: this.filterConditions.length
    });
  }
}
```

#### 5.2 GSI Health Monitoring

```typescript
// lib_new/src/GSIMonitor.ts
export class GSIMonitor {
  constructor(private client: DynamoDBClient) {}
  
  async getGSIStatus(tableName: string): Promise<GSIStatusReport[]> {
    const describeCommand = new DescribeTableCommand({ TableName: tableName });
    const response = await this.client.send(describeCommand);
    
    const gsiReports: GSIStatusReport[] = [];
    
    response.Table?.GlobalSecondaryIndexes?.forEach(gsi => {
      gsiReports.push({
        indexName: gsi.IndexName!,
        status: gsi.IndexStatus!,
        itemCount: gsi.ItemCount || 0,
        sizeBytes: gsi.IndexSizeBytes || 0,
        backfilling: gsi.IndexStatus === 'CREATING',
        throughput: {
          read: gsi.ProvisionedThroughput?.ReadCapacityUnits || 0,
          write: gsi.ProvisionedThroughput?.WriteCapacityUnits || 0
        }
      });
    });
    
    return gsiReports;
  }
}

interface GSIStatusReport {
  indexName: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  backfilling: boolean;
  throughput: { read: number; write: number };
}
```

## Benefits of GSI Implementation

### 1. Type Safety ✅
- Compile-time validation of GSI queries
- Schema-based GSI key validation
- Projection attribute type checking
- Full TypeScript IntelliSense support

### 2. Developer Experience ✅
- Intuitive GSI configuration alongside model definition
- Clear error messages for GSI misuse
- Automatic GSI creation with table setup
- Query optimization recommendations

### 3. Performance ✅
- Efficient GSI query routing
- Projection validation prevents over-fetching
- Cost estimation for query planning
- Optimized expression building

### 4. Maintainability ✅
- Schema-driven GSI management
- Centralized GSI configuration
- Automatic GSI validation
- Comprehensive error handling

## Migration Strategy

### Phase 1: Foundation (Immediate)
1. ✅ Add GSI configuration types
2. ✅ Enhance ModelConfig interface
3. ✅ Create GSI error classes
4. ✅ Update Model constructor

### Phase 2: QueryBuilder Enhancement (Week 1)
1. ✅ Add GSI validation to QueryBuilder
2. ✅ Implement index information mapping
3. ✅ Add GSI-specific query methods
4. ✅ Enhance projection validation

### Phase 3: Table Management (Week 2)
1. ✅ Update TableManager for GSI creation
2. ✅ Add GSI management methods
3. ✅ Implement GSI status monitoring
4. ✅ Add GSI optimization features

### Phase 4: Advanced Features (Week 3)
1. ✅ Implement cost estimation
2. ✅ Add query optimization recommendations
3. ✅ Create GSI health monitoring
4. ✅ Add comprehensive testing

## Testing Strategy

### Unit Tests
- GSI configuration validation
- QueryBuilder GSI integration
- Error handling scenarios
- Type safety verification

### Integration Tests
- Actual GSI creation and querying
- Cross-index query validation
- Performance benchmarking
- Cost estimation accuracy

### Example Test Cases

```typescript
describe('GSI Support', () => {
  it('should validate GSI query keys', async () => {
    expect(() => {
      User.queryGSI('EmailIndex', { status: 'active' }); // Wrong key
    }).toThrow(GSIValidationError);
  });
  
  it('should validate projection attributes', async () => {
    expect(() => {
      User.queryGSI('RegionStatusIndex', { region: 'us-west-2' })
        .projectionExpression('metadata'); // Not projected
    }).toThrow(ProjectionError);
  });
  
  it('should create GSIs with table', async () => {
    await tableManager.createTable(User);
    const status = await gsiMonitor.getGSIStatus('users');
    expect(status).toHaveLength(3); // 3 GSIs defined
  });
});
```

## Conclusion

This GSI implementation plan provides:

1. **Comprehensive GSI Support**: Full lifecycle management from definition to querying
2. **Type Safety**: Complete TypeScript integration with runtime validation
3. **Performance Optimization**: Query cost estimation and optimization recommendations
4. **Developer Experience**: Intuitive API with clear error messages
5. **Maintainability**: Schema-driven approach with centralized configuration

The implementation builds naturally on the existing QueryBuilder and Model architecture while adding powerful GSI capabilities that maintain type safety and provide excellent developer experience.

## Future Enhancements

- **Sparse Index Support**: Handle sparse GSI patterns automatically
- **GSI Auto-scaling**: Integration with DynamoDB auto-scaling
- **Cross-Region GSI**: Support for global tables with GSIs
- **GSI Analytics**: Query pattern analysis and optimization suggestions
- **Composite GSI Keys**: Advanced key composition strategies