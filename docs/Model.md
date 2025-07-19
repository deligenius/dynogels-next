# Model Documentation

## Overview

The Model class provides type-safe CRUD operations for DynamoDB tables using AWS SDK v3 and Zod schema validation. It follows modern TypeScript patterns and provides a clean, focused API for data operations.

## Architecture

### Core Features
- **Type Safety**: Full TypeScript support with Zod schema validation
- **AWS SDK v3**: Uses `@aws-sdk/lib-dynamodb` for native value handling
- **Schema Validation**: Runtime validation with automatic type inference
- **Error Handling**: Custom exception classes with specific error types
- **Timestamps**: Automatic `createdAt` and `updatedAt` handling
- **Batch Operations**: Efficient batch get operations with automatic chunking

### Key Components
- **Model Class**: Core CRUD operations with type safety
- **ModelFactory**: Factory for creating Model instances with configuration
- **Custom Errors**: Specific error types for different scenarios

## API Reference

### Model Class

The Model class provides the core CRUD operations for DynamoDB tables.

#### Constructor
```typescript
new Model<TSchema, THashKey, TRangeKey, TConfig>(
  client: DynamoDBDocument,
  config: TConfig
)
```

#### Methods

##### `get(key, options?): Promise<Item | null>`
Retrieve a single item by its primary key.

```typescript
const user = await User.get({ id: 'user-123' });
const user = await User.get({ id: 'user-123' }, { consistentRead: true });
```

##### `create(item): Promise<Item>`
Create a new item with automatic timestamp handling and validation.

```typescript
const user = await User.create({
  id: 'user-123',
  email: 'john@example.com',
  name: 'John Doe'
});
```

##### `update(key, updates): Promise<Item>`
Update an existing item with automatic `updatedAt` timestamp.

```typescript
const updatedUser = await User.update(
  { id: 'user-123' },
  { name: 'John Smith', age: 30 }
);
```

##### `getMany(keys, options?): Promise<Item[]>`
Batch retrieve multiple items with automatic chunking (100 items per request).

```typescript
const users = await User.getMany([
  { id: 'user-1' },
  { id: 'user-2' },
  { id: 'user-3' }
]);
```

##### `destroy(key): Promise<Item | null>`
Delete an item and return the deleted item (if it existed).

```typescript
const deletedUser = await User.destroy({ id: 'user-123' });
```

##### `query(keyValues): QueryBuilder`
Start a new query with the provided key-value pairs. See QueryBuilder documentation for details.

```typescript
const results = await User.query({ id: 'user-123' })
  .filter('status').eq('active')
  .exec();
```

### ModelFactory Class

Factory for creating Model instances with specific configurations.

#### Constructor
```typescript
new ModelFactory(client: DynamoDBClient)
```

#### Methods

##### `defineModel(config): Model`
Create a new Model instance with the specified configuration.

```typescript
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true }
});
```

### Configuration Options

#### ModelConfig
```typescript
interface ModelConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName: string;
  timestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
  globalSecondaryIndexes?: Record<string, GSIConfig<T>>;
  localSecondaryIndexes?: Record<string, LSIConfig<T>>;
}
```

## Usage Examples

### Basic Setup
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ModelFactory } from './src/ModelFactory.js';
import { z } from 'zod';

const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true }
});
```

### CRUD Operations
```typescript
// Create a user
const user = await User.create({
  id: 'user-123',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30
});

// Get a user
const retrieved = await User.get({ id: 'user-123' });

// Update a user
const updated = await User.update(
  { id: 'user-123' },
  { name: 'John Smith', age: 31 }
);

// Delete a user
const deleted = await User.destroy({ id: 'user-123' });

// Batch get multiple users
const users = await User.getMany([
  { id: 'user-1' },
  { id: 'user-2' },
  { id: 'user-3' }
]);
```

### Composite Key Models
```typescript
const postSchema = z.object({
  userId: z.string(),
  postId: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const Post = factory.defineModel({
  hashKey: 'userId',
  rangeKey: 'postId',
  schema: postSchema,
  tableName: 'posts',
  timestamps: { createdAt: true, updatedAt: true }
});

// Operations with composite keys
const post = await Post.create({
  userId: 'user-123',
  postId: 'post-456',
  title: 'My First Post',
  content: 'Hello, world!'
});

const retrieved = await Post.get({
  userId: 'user-123',
  postId: 'post-456'
});
```

### Error Handling
```typescript
import { ItemNotFoundError, ValidationError } from './src/errors/DynamoDBError.js';

try {
  const user = await User.get({ id: 'nonexistent' });
  if (!user) {
    console.log('User not found');
  }
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

try {
  await User.update({ id: 'nonexistent' }, { name: 'New Name' });
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    console.error('Cannot update: item not found');
  }
}
```