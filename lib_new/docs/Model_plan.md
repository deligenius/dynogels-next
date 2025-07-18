# Model Reimplementation Plan

## Overview

This document outlines the complete reimplementation of `lib_new/src/Table.ts` as a new `Model` system from scratch, following the design principles outlined in `docs/principles.md` and using `@aws-sdk/lib-dynamodb` as the database engine.

## Current Implementation Analysis

### Issues with Current Code

1. **Principle Violations**:
   - Mixed responsibilities: Model class handles both data operations and table management
   - Poor error handling: Uses `console.error` and generic `Error` messages
   - Limited type safety: Basic TypeScript usage without leveraging full potential
   - Mutable operations: Methods could cause unexpected side effects
   - Complex API surface: Too many responsibilities in single class

2. **Specific Problems**:
   - `@ts-ignore` usage indicating type safety issues
   - Table creation/deletion mixed with data operations
   - Generic error messages without specific exception types
   - Query method with incorrect variable naming (`UpdateExpressions` for queries)
   - No dependency injection for testing
   - No separation between table schema and runtime operations

## New Architecture Design

### Core Principles Implementation

#### 1. Promise-First Architecture ✅
- All database operations return Promises
- No callback support
- Native async/await usage

#### 2. TypeScript-First Development ✅
- Comprehensive type safety with generics
- Strict TypeScript configuration
- Full type inference from Zod schemas
- No `@ts-ignore` usage

#### 3. Modern Schema Validation ✅
- Zod for runtime validation
- Type inference from schemas
- Better error messages

#### 4. AWS SDK v3 Integration ✅
- Use `@aws-sdk/lib-dynamodb` exclusively
- Modular imports
- Modern patterns

#### 5. Minimal API Surface ✅
- Separate concerns: Model vs Table management
- Core CRUD operations only
- Clean, focused interfaces

#### 6. Immutable Operations ✅
- Operations return new instances
- No mutation of input parameters
- Functional programming principles

#### 7. Explicit Error Handling ✅
- Custom exception classes
- Specific error types for different scenarios
- No hidden errors

#### 8. Performance by Default ✅
- Efficient operations
- Minimal object creation
- Connection reuse

#### 9. Testability First ✅
- Dependency injection
- Clean interfaces for mocking
- Predictable behavior

#### 10. Zero Configuration Defaults ✅
- Sensible defaults
- Progressive customization
- Convention over configuration

## Implementation Plan

### Phase 1: Foundation (Error Handling & Types)

#### 1.1 Custom Error Classes
```typescript
// lib_new/src/errors/DynamoDBError.ts
export abstract class DynamoDBError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
}

export class ItemNotFoundError extends DynamoDBError {
  readonly code = 'ItemNotFound';
  readonly statusCode = 404;
}

export class ConditionalCheckFailedError extends DynamoDBError {
  readonly code = 'ConditionalCheckFailedException';
  readonly statusCode = 400;
}

export class ValidationError extends DynamoDBError {
  readonly code = 'ValidationException';
  readonly statusCode = 400;
}

export class ResourceNotFoundError extends DynamoDBError {
  readonly code = 'ResourceNotFoundException';
  readonly statusCode = 404;
}

export class ResourceInUseError extends DynamoDBError {
  readonly code = 'ResourceInUseException';
  readonly statusCode = 400;
}
```

#### 1.2 Core Types and Interfaces
```typescript
// lib_new/src/types/Model.ts
import { z } from 'zod';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

export interface ModelConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName: string;
  timestamps?: {
    createdAt?: boolean; // ISO string
    updatedAt?: boolean; // ISO string
  }
  ttl?: {
    attribute: keyof z.infer<T>;
  };
}

// Utility type for primary keys
export type PrimaryKey<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined = undefined
> = {
  [K in THashKey]: z.infer<TSchema>[K];
} & (TRangeKey extends keyof z.infer<TSchema>
  ? { [K in TRangeKey]: z.infer<TSchema>[K] }
  : {});

// Utility type for partial updates
export type UpdateInput<T> = Partial<Omit<T, 'createdAt'>> & {
  updatedAt?: never; // Prevent manual updatedAt setting
};
```

### Phase 2: Core Model Implementation

#### 2.1 Model Class
```typescript
// lib_new/src/Model.ts
import { z } from 'zod';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { ModelConfig, ModelOptions, PrimaryKey, UpdateInput } from './types/Model';
import { ItemNotFoundError, ValidationError } from './errors/DynamoDBError';

export class Model<
  TSchema extends z.ZodObject<any>,
  TItem extends z.infer<TSchema> = z.infer<TSchema>,
  THashKey extends keyof TItem = keyof TItem,
  TRangeKey extends keyof TItem | undefined = undefined
> {
  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: ModelConfig<TSchema>
  ) {}

  async get(
    key: PrimaryKey<TSchema, THashKey, TRangeKey>,
  ): Promise<TItem | null> {
    const result = await this.client.get({
      TableName: this.config.tableName,
      Key: key,
    });

    if (!result.Item) {
      return null;
    }

    return this.validateAndTransform(result.Item);
  }

  async create(item: Omit<TItem, 'createdAt' | 'updatedAt'>): Promise<TItem> {
    const now = new Date().toISOString();
    const timestamps = this.getTimestamps(now, now);
    
    const itemToSave = {
      ...item,
      ...timestamps,
    } as TItem;

    const validatedItem = this.validateAndTransform(itemToSave);

    await this.client.put({
      TableName: this.config.tableName,
      Item: validatedItem,
      ConditionExpression: `attribute_not_exists(${String(this.config.hashKey)})`,
    });

    return validatedItem;
  }

  async update(
    key: PrimaryKey<TSchema, THashKey, TRangeKey>,
    updates: UpdateInput<TItem>,
    options: ModelOptions = {}
  ): Promise<TItem> {
    const existingItem = await this.get(key, { consistentRead: true });
    if (!existingItem) {
      throw new ItemNotFoundError(`Item with key ${JSON.stringify(key)} not found`);
    }

    const now = new Date().toISOString();
    const timestamps = this.getTimestamps(existingItem.createdAt, now);

    const updatedItem = {
      ...existingItem,
      ...updates,
      ...timestamps,
    } as TItem;

    const validatedItem = this.validateAndTransform(updatedItem);

    await this.client.put({
      TableName: this.config.tableName,
      Item: validatedItem,

    });

    return validatedItem;
  }

  async getMany(
    keys: PrimaryKey<TSchema, THashKey, TRangeKey>[],
    options: ModelOptions = {}
  ): Promise<TItem[]> {
    if (keys.length === 0) {
      return [];
    }

    // DynamoDB BatchGetItem has a limit of 100 items per request
    const batches: PrimaryKey<TSchema, THashKey, TRangeKey>[][] = [];
    for (let i = 0; i < keys.length; i += 100) {
      batches.push(keys.slice(i, i + 100));
    }

    const results: TItem[] = [];

    for (const batch of batches) {
      const result = await this.client.batchGet({
        RequestItems: {
          [this.config.tableName]: {
            Keys: batch,
            ConsistentRead: options.consistentRead,
          },
        },
      });

      if (result.Responses && result.Responses[this.config.tableName]) {
        for (const item of result.Responses[this.config.tableName]) {
          results.push(this.validateAndTransform(item));
        }
      }

      // Handle unprocessed keys if needed
      if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
        // For now, we'll throw an error. In production, you might want to retry
        throw new Error('Some keys were not processed. Retry logic needed.');
      }
    }

    return results;
  }

  async destroy(
    key: PrimaryKey<TSchema, THashKey, TRangeKey>
  ): Promise<TItem | null> {
    const result = await this.client.delete({
      TableName: this.config.tableName,
      Key: key,
      ReturnValues: 'ALL_OLD',
    });

    if (!result.Attributes) {
      return null;
    }

    return this.validateAndTransform(result.Attributes);
  }

  private validateAndTransform(item: any): TItem {
    try {
      return this.config.schema.parse(item) as TItem;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Validation failed: ${error.issues.map(i => i.message).join(', ')}`
        );
      }
      throw error;
    }
  }

  private getTimestamps(createdAt?: string, updatedAt?: string) {
    const timestamps: { createdAt?: string; updatedAt?: string } = {};
    
    if (this.config.timestamps?.createdAt && createdAt) {
      timestamps.createdAt = createdAt;
    }
    
    if (this.config.timestamps?.updatedAt && updatedAt) {
      timestamps.updatedAt = updatedAt;
    }
    
    return timestamps;
  }
}
```

### Phase 3: Factory Pattern

#### 3.1 Model Factory
```typescript
// lib_new/src/ModelFactory.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { Model } from './Model';
import { ModelConfig } from './types/Model';

export class ModelFactory {
  private readonly documentClient: DynamoDBDocument;

  constructor(private readonly client: DynamoDBClient) {
    this.documentClient = DynamoDBDocument.from(client);
  }

  defineModel<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ): Model<TSchema> {
    return new Model(this.documentClient, config);
  }
}
```

### Phase 4: Table Management (Separate Concern)

#### 4.1 Table Manager
```typescript
// lib_new/src/TableManager.ts
import { 
  DynamoDBClient, 
  CreateTableCommand, 
  DeleteTableCommand,
  DescribeTableCommand,
  type ScalarAttributeType,
  ResourceInUseException,
  ResourceNotFoundException
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelConfig } from './types/Model';
import { ResourceInUseError, ResourceNotFoundError } from './errors/DynamoDBError';

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
      });

      await this.client.send(command);
    } catch (error) {
      if (error instanceof ResourceInUseException) {
        throw new ResourceInUseError(`Table ${config.tableName} already exists`);
      }
      throw error;
    }
  }

  async deleteTable(tableName: string): Promise<void> {
    try {
      const command = new DeleteTableCommand({ TableName: tableName });
      await this.client.send(command);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw new ResourceNotFoundError(`Table ${tableName} does not exist`);
      }
      throw error;
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }

  private extractConfig<TSchema extends z.ZodObject<any>>(
    modelOrConfig: Model<TSchema> | ModelConfig<TSchema>
  ): ModelConfig<TSchema> {
    // If it's a Model instance, extract the config from it
    if ('config' in modelOrConfig && typeof modelOrConfig.config === 'object') {
      return (modelOrConfig as any).config;
    }
    // Otherwise, it's already a config object
    return modelOrConfig as ModelConfig<TSchema>;
  }

  private buildKeySchema<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ) {
    const keySchema = [
      {
        AttributeName: String(config.hashKey),
        KeyType: 'HASH' as const,
      },
    ];

    if (config.rangeKey) {
      keySchema.push({
        AttributeName: String(config.rangeKey),
        KeyType: 'RANGE' as const,
      });
    }

    return keySchema;
  }

  private buildAttributeDefinitions<TSchema extends z.ZodObject<any>>(
    config: ModelConfig<TSchema>
  ) {
    const attrs = [
      {
        AttributeName: String(config.hashKey),
        AttributeType: this.getAttributeType(
          config.schema.shape[config.hashKey]
        ),
      },
    ];

    if (config.rangeKey) {
      attrs.push({
        AttributeName: String(config.rangeKey),
        AttributeType: this.getAttributeType(
          config.schema.shape[config.rangeKey]
        ),
      });
    }

    return attrs;
  }

  private getAttributeType(zodType: z.ZodType): ScalarAttributeType {
    if (zodType instanceof z.ZodString) return 'S';
    if (zodType instanceof z.ZodNumber) return 'N';
    if (zodType instanceof z.ZodArray) return 'B';
    
    throw new Error(
      `Unsupported key type: ${zodType.constructor.name}. Keys must be string, number, or binary.`
    );
  }
}
```

### Phase 5: Main Export and Integration

#### 5.1 Main Module
```typescript
// lib_new/src/index.ts
export { Model } from './Model';
export { ModelFactory } from './ModelFactory';
export { TableManager } from './TableManager';
export * from './types/Model';
export * from './errors/DynamoDBError';

// Convenience exports
export { DynamoDBClient } from '@aws-sdk/client-dynamodb';
export { z } from 'zod';
```

#### 5.2 Usage Example
```typescript
// Example usage
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ModelFactory, TableManager, z } from './lib_new/src';

// Setup
const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);
const tableManager = new TableManager(client);

// Define schema
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create model
const User = factory.defineMode({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
});

// Table management (separate concern) - can use model directly
await tableManager.createTable(User);

// Or use config directly (legacy way)
await tableManager.createTable({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
});

// CRUD operations
const user = await User.create({
  id: '123',
  email: 'user@example.com',
  name: 'John Doe',
  age: 30,
});

const retrieved = await User.get({ id: '123' });
const updated = await User.update({ id: '123' }, { age: 31 });

// Batch get multiple items
const users = await User.getMany([
  { id: '123' },
  { id: '456' },
  { id: '789' }
]);

const deleted = await User.destroy({ id: '123' });
```

## Benefits of New Architecture

### 1. Principle Adherence
- ✅ **Promise-first**: All operations async/await
- ✅ **TypeScript-first**: Comprehensive type safety
- ✅ **Modern validation**: Zod integration
- ✅ **AWS SDK v3**: Latest patterns
- ✅ **Minimal API**: Clean separation of concerns
- ✅ **Immutable**: No input mutation
- ✅ **Explicit errors**: Custom exception classes
- ✅ **Performance**: Efficient operations
- ✅ **Testable**: Dependency injection
- ✅ **Zero config**: Sensible defaults

### 2. Code Quality Improvements
- Eliminated `@ts-ignore` usage
- Proper error handling with specific exceptions
- Clear separation between Model and Table concerns
- Full type inference from Zod schemas
- Comprehensive test coverage possibilities

### 3. Developer Experience
- IntelliSense support for all operations
- Clear error messages
- Predictable API behavior
- Easy mocking for tests
- Convention over configuration

This architecture provides a solid foundation that can be extended with additional features like query builders, batch operations, and advanced DynamoDB features while maintaining the core principles.