# Dynogels Next - TypeScript DynamoDB Data Mapper

A modern TypeScript DynamoDB data mapper for Node.js built with AWS SDK v3, Zod schema validation, and comprehensive type safety. This represents a complete rewrite with modern TypeScript patterns, ESM modules, and Promise-first architecture.

## Table of Contents
1. [Quick Start](#-quick-start)
2. [Installation](#installation)
3. [Basic Usage](#basic-usage)
4. [CRUD Operations](#crud-operations)
5. [Query & Scan Operations](#query--scan-operations)
6. [Global Secondary Indexes](#global-secondary-indexes)
7. [Advanced Features](#advanced-features)
8. [Table Management](#table-management)
9. [Configuration](#🔧-configuration)
10. [Testing](#🧪-testing)
11. [Examples](#running-examples)
12. [Development](#🛠-development)
13. [API Reference](#api-reference)
14. [Important Notes](#🚨-important-notes)
15. [Contributing](#🤝-contributing)
16. [License](#📄-license)

## 🚀 Quick Start

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory } from 'dynogels-next';

// Initialize
const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

// Define schema with Zod
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create model
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true },
});

// Create and query
const user = await User.create({
  id: 'user-1',
  email: 'john@example.com',
  name: 'John Doe',
});

const users = await User.query({ id: 'user-1' })
  .filter('age').gte(18)
  .exec();
```

## Installation

```bash
npm install dynogels-next

# Dependencies (included automatically)
# @aws-sdk/client-dynamodb
# @aws-sdk/lib-dynamodb
# zod
```

## Basic Usage

### Model Definition

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory } from 'dynogels-next';

const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

// Define your schema with Zod for validation and type inference
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create a model with configuration
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true },
});
```

## CRUD Operations

### Create
```typescript
const user = await User.create({
  id: 'user-123',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  status: 'active'
});
// Timestamps are automatically added
```

### Read
```typescript
// Get single item
const user = await User.get({ id: 'user-123' });

// Get with consistent read
const user = await User.get({ id: 'user-123' }, { consistentRead: true });

// Batch get multiple items
const users = await User.getMany([
  { id: 'user-1' },
  { id: 'user-2' },
  { id: 'user-3' }
]);
```

### Update
```typescript
// Update specific fields
const updatedUser = await User.update(
  { id: 'user-123' },
  { name: 'John Smith', age: 31 }
);
// updatedAt timestamp is automatically updated
```

### Delete
```typescript
// Delete and return the deleted item
const deletedUser = await User.destroy({ id: 'user-123' });
```

## Query & Scan Operations

### Basic Queries
```typescript
// Query by hash key only
const users = await User.query({ id: 'user-123' }).exec();

// Query with filters (non-key attributes)
const activeUsers = await User.query({ id: 'user-123' })
  .filter('status').eq('active')
  .filter('age').gte(18)
  .exec();
```

### Composite Key Queries
```typescript
// Define a model with composite keys
const postSchema = z.object({
  userId: z.string(),
  postId: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

const Post = factory.defineModel({
  hashKey: 'userId',
  rangeKey: 'postId',
  schema: postSchema,
  tableName: 'posts',
});

// Query with both keys (exact match)
const post = await Post.query({ 
  userId: 'user-123', 
  postId: 'post-456' 
}).exec();

// Query with hash key only (returns all posts for user)
const userPosts = await Post.query({ userId: 'user-123' }).exec();

// Query with range key conditions
const recentPosts = await Post.query({ userId: 'user-123' })
  .where('postId').beginsWith('2023-')
  .exec();
```

### Advanced Query Operators
```typescript
// String operations
const posts = await Post.query({ userId: 'user-123' })
  .where('title').beginsWith('How to')
  .filter('content').contains('TypeScript')
  .exec();

// Numeric operations
const products = await Product.query({ category: 'electronics' })
  .filter('price').between(100, 500)
  .filter('rating').gte(4.0)
  .exec();

// Boolean and existence checks
const items = await Item.query({ type: 'product' })
  .filter('inStock').eq(true)
  .filter('discount').exists()
  .exec();

// Multiple conditions
const results = await User.query({ department: 'engineering' })
  .filter('status').eq('active')
  .filter('age').between(25, 45)
  .filter('skills').contains('typescript')
  .exec();
```

### Pagination
```typescript
// Basic pagination
const page = await User.query({ status: 'active' })
  .limit(10)
  .execWithPagination();

console.log('Items:', page.items);
console.log('Count:', page.count);
console.log('Has more:', !!page.lastEvaluatedKey);

// Continue pagination
const nextPage = await User.query({ status: 'active' })
  .startKey(page.lastEvaluatedKey)
  .limit(10)
  .execWithPagination();
```

### Streaming Large Results
```typescript
// Stream results for memory-efficient processing
for await (const batch of User.query({ status: 'active' }).stream()) {
  console.log(`Processing batch of ${batch.length} items`);
  for (const user of batch) {
    // Process each user
    console.log(`Processing user: ${user.name}`);
  }
}

// Load all results (use with caution)
const allUsers = await User.query({ status: 'active' })
  .loadAll()
  .exec();
```

### Table Scanning
```typescript
// Scan entire table
const allUsers = await User.scan().exec();

// Scan with filters
const activeUsers = await User.scan()
  .filter('status').eq('active')
  .filter('age').between(25, 45)
  .exec();

// Parallel scanning for large tables
const segment0 = await User.scan()
  .segments(0, 4)  // Segment 0 of 4 total segments
  .filter('status').eq('active')
  .exec();

// Process all segments concurrently
const promises = Array.from({ length: 4 }, (_, i) =>
  User.scan()
    .segments(i, 4)
    .filter('status').eq('active')
    .exec()
);
const results = await Promise.all(promises);
const allResults = results.flat();
```

## Global Secondary Indexes

### GSI Configuration
```typescript
const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  department: z.string(),
  status: z.string(),
  lastLogin: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  globalSecondaryIndexes: {
    'EmailIndex': {
      hashKey: 'email',
      projectionType: 'ALL'
    },
    'DepartmentStatusIndex': {
      hashKey: 'department',
      rangeKey: 'status',
      projectionType: 'INCLUDE',
      projectedAttributes: ['email', 'lastLogin']
    },
    'StatusIndex': {
      hashKey: 'status',
      projectionType: 'KEYS_ONLY'
    }
  }
});
```

### Querying GSI with Type Safety
```typescript
// Hash-only GSI query
const userByEmail = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')  // ✅ Compile-time validation
  .exec();

// Composite GSI query
const activeEngineers = await User.query({ 
  department: 'engineering', 
  status: 'active' 
})
  .usingIndex('DepartmentStatusIndex')
  .exec();

// GSI query with additional filters
const recentActiveUsers = await User.query({ status: 'active' })
  .usingIndex('StatusIndex')
  .filter('lastLogin').gte('2023-01-01')
  .exec();

// Invalid index names cause TypeScript errors
const invalid = await User.query({ status: 'active' })
  .usingIndex('NonExistentIndex'); // ❌ TypeScript compile error
```

## Advanced Features

### Error Handling
```typescript
import { ItemNotFoundError, ValidationError } from 'dynogels-next';

try {
  const user = await User.get({ id: 'nonexistent' });
  if (!user) {
    console.log('User not found');
  }
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  } else if (error instanceof ItemNotFoundError) {
    console.error('Item not found:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Conditional Operations
```typescript
// Conditional update (item must exist)
try {
  const updated = await User.update(
    { id: 'user-123' },
    { name: 'New Name' }
  );
} catch (error) {
  if (error instanceof ItemNotFoundError) {
    console.error('Cannot update: item does not exist');
  }
}
```

### Timestamps
```typescript
// Automatic timestamp handling
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: {
    createdAt: true,  // Automatically set on creation
    updatedAt: true   // Automatically updated on modification
  }
});

// Timestamps are ISO 8601 strings
const user = await User.create({ id: '123', name: 'John' });
console.log(user.createdAt); // "2023-12-01T10:30:00.000Z"
console.log(user.updatedAt); // "2023-12-01T10:30:00.000Z"
```

## Table Management

```typescript
import { TableManager } from 'dynogels-next';

const tableManager = new TableManager(client);

// Create table with model configuration
await tableManager.createTable(User, {
  readCapacity: 5,
  writeCapacity: 5,
});

// Check if table exists
const exists = await tableManager.tableExists('users');

// Wait for table to become active
await tableManager.waitForTable('users', 'ACTIVE');

// Delete table
await tableManager.deleteTable('users');
```

## API Reference

### ModelFactory
- `new ModelFactory(client: DynamoDBClient)` - Create factory instance
- `defineModel(config: ModelConfig)` - Define a new model

### Model Methods
- `create(item: ItemInput): Promise<Item>` - Create new item
- `get(key: KeyInput, options?: GetOptions): Promise<Item | null>` - Get single item
- `getMany(keys: KeyInput[]): Promise<Item[]>` - Batch get multiple items
- `update(key: KeyInput, updates: UpdateInput): Promise<Item>` - Update item
- `destroy(key: KeyInput): Promise<Item | null>` - Delete item
- `query(keyValues: QueryInput): QueryBuilder` - Start new query
- `scan(): ScanBuilder` - Start new scan

### QueryBuilder Methods
- `where(field): QueryConditions` - Add key conditions
- `filter(field): FilterConditions` - Add filter conditions
- `usingIndex(indexName): QueryBuilder` - Use secondary index
- `limit(count): QueryBuilder` - Limit results
- `ascending() / descending(): QueryBuilder` - Sort order
- `consistentRead(enabled?): QueryBuilder` - Consistent reads
- `startKey(key): QueryBuilder` - Pagination start key
- `projectionExpression(expr): QueryBuilder` - Specify returned attributes
- `exec(): Promise<Item[]>` - Execute query
- `execWithPagination(): Promise<PageResult>` - Execute with pagination
- `stream(): AsyncIterableIterator<Item[]>` - Stream results
- `loadAll(): QueryBuilder` - Load all pages

### ScanBuilder Methods
- `filter(field): FilterConditions` - Add filter conditions
- `limit(count): ScanBuilder` - Limit results per page
- `segments(segment, total): ScanBuilder` - Parallel scanning
- `consistentRead(enabled?): ScanBuilder` - Consistent reads
- `exec(): Promise<Item[]>` - Execute scan
- `execWithPagination(): Promise<PageResult>` - Execute with pagination

### Condition Operators

#### All Field Types
- `eq(value)` / `equals(value)` - Exact match
- `ne(value)` / `notEquals(value)` - Not equal
- `gt(value)` / `greaterThan(value)` - Greater than
- `gte(value)` / `greaterThanOrEqual(value)` - Greater than or equal
- `lt(value)` / `lessThan(value)` - Less than
- `lte(value)` / `lessThanOrEqual(value)` - Less than or equal
- `between(min, max)` - Range condition
- `in(values)` - Value in array
- `exists()` - Attribute exists
- `notExists()` - Attribute does not exist

#### String Fields Only
- `beginsWith(prefix)` - String starts with prefix
- `contains(substring)` - String contains substring (filter only)
- `notContains(substring)` - String does not contain substring (filter only)

## Running Examples

The project includes comprehensive demos showing various features:

```bash
# Main demo with all features
npm start

# Model operations demo
tsx src/examples/model_demo.ts

# Query operations demo  
tsx src/examples/query_demo.ts

# Global Secondary Index demo
tsx src/examples/gsi_demo.ts
```

### Example Project Structure
```
dynogels-next/
├── src/                      # TypeScript implementation
│   ├── Model.ts              # Base model class
│   ├── ModelFactory.ts       # Model factory
│   ├── TableManager.ts       # Table lifecycle utilities
│   ├── query/
│   │   ├── QueryBuilder.ts   # Fluent query API
│   │   ├── QueryConditions.ts # Type-safe conditions
│   │   └── QueryExpressions.ts # Expression building
│   ├── scan/
│   │   └── ScanBuilder.ts    # Table scanning API
│   ├── types/                # Shared TypeScript types
│   └── examples/             # Usage examples
├── docs/                     # Architecture documentation
├── dist/                     # Compiled JavaScript output
└── package.json              # Dependencies and scripts
```

## 🔧 Configuration

### ModelConfig Interface
```typescript
interface ModelConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;                      // Primary partition key
  rangeKey?: keyof z.infer<T>;                    // Optional sort key
  schema: T;                                      // Zod validation schema
  tableName: string;                              // DynamoDB table name
  globalSecondaryIndexes?: Record<string, GSIConfig<T>>; // GSI configuration
  localSecondaryIndexes?: Record<string, LSIConfig<T>>;  // LSI configuration
  timestamps?: {                                  // Auto timestamp handling
    createdAt?: boolean;
    updatedAt?: boolean;
  };
}
```

### GSI Configuration
```typescript
interface GSIConfig<TSchema extends z.ZodObject<any>> {
  hashKey: keyof z.infer<TSchema>;               // GSI partition key
  rangeKey?: keyof z.infer<TSchema>;             // Optional GSI sort key
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE'; // Projection type
  projectedAttributes?: (keyof z.infer<TSchema>)[]; // For INCLUDE projection
}
```

### Environment Configuration
```typescript
// AWS credentials and region
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// For local development with DynamoDB Local
const localClient = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});
```

## 🧪 Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
# Requires DynamoDB Local or AWS access
npm run test:integration
```

### Coverage
```bash
npm run test:coverage
```

## 🛠 Development

### Prerequisites

- Node.js 16+
- AWS credentials configured
- DynamoDB Local (for testing)

### Commands

```bash
cd lib_new

# Build
npm run build

# Development
npm run dev           # Watch mode
npm start             # Run demo app

# Code quality
npm run lint          # Biome linter
```

## 🚨 Important Notes

### Design Principles
- **Promise-First Architecture**: All database operations return Promises without callback support
- **TypeScript-First Development**: Built with TypeScript from the ground up with comprehensive type safety
- **Modern Schema Validation**: Uses Zod for runtime schema validation with better TypeScript integration
- **AWS SDK v3 Integration**: Built on AWS SDK v3 with modular imports and native Promise support
- **Immutable Operations**: Operations don't mutate input parameters, returning new instances
- **Explicit Error Handling**: All errors thrown as exceptions with try-catch blocks

### Requirements
- **Node.js 16+** for ESM and AWS SDK v3 compatibility
- **ESM modules** exclusively - no CommonJS support
- **TypeScript 5.5+** for modern TypeScript features
- **AWS credentials** configured for DynamoDB access
- **DynamoDB Local** or AWS DynamoDB for integration tests

### Performance Features
- **Native value support** - no manual AttributeValue conversion needed
- **Automatic expression building** with unique value keys
- **Batch operations** with automatic chunking (100 items per request)
- **Streaming support** for memory-efficient processing of large datasets
- **Parallel scanning** for better performance on large tables
- **Connection reuse** and pooling with AWS SDK v3

## 🤝 Contributing

1. Follow TypeScript best practices and strict mode
2. Add comprehensive tests for new features (unit + integration)
3. Use Biome for code formatting and linting
4. Ensure type safety with Zod schema validation
5. Update documentation for new features
6. Follow semantic versioning for releases

### Development Setup
```bash
# Clone and install dependencies
git clone <repository>
cd dynogels-next
npm install

# Run tests
npm test
npm run test:coverage

# Build and lint
npm run build
npm run lint
```

## 📄 License

See [LICENSE](legacy-lib/LICENSE) file for details.

---

For detailed architecture information, see [CLAUDE.md](CLAUDE.md).
