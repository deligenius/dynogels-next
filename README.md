# Dynogels Next - TypeScript DynamoDB Data Mapper

A modern TypeScript rewrite of dynogels, providing a fluent API for DynamoDB operations with full type safety, AWS SDK v3 integration, and ESM modules.

## Table of Contents
1. [Quick Start](#-quick-start)
2. [Running Examples](#running-examples)
3. [Key Features](#✨-key-features)
4. [Project Structure](#📁-project-structure)
5. [Configuration](#🔧-configuration)
6. [Testing](#🧪-testing)
7. [Development](#🛠-development)
8. [Important Notes](#🚨-important-notes)
9. [Contributing](#🤝-contributing)
10. [License](#📄-license)

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install dynogels-next
```

### Basic Usage

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory } from 'dynogels-next';

// Initialize
const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

// Define schema
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
});

// Create model
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true },
});

// CRUD operations
const user = await User.create({
  id: 'user-1',
  email: 'john@example.com',
  name: 'John Doe',
});

const retrieved = await User.get({ id: 'user-1' });
const updated = await User.update({ id: 'user-1' }, { name: 'John Smith' });
await User.destroy({ id: 'user-1' });
```

### Query Operations

```typescript
// Basic query
const users = await User.query({ id: 'user-1' }).exec();

// Query with filters
const activeUsers = await User.query({ id: 'user-1' })
  .filter('status').eq('active')
  .filter('age').gte(18)
  .limit(10)
  .exec();

// Composite key query
const Product = factory.defineModel({
  hashKey: 'productId',
  rangeKey: 'category',
  schema: productSchema,
  tableName: 'products',
});

const products = await Product.query({ 
  productId: 'prod-1', 
  category: 'electronics' 
}).exec();
```

### Running Examples

```bash
# Main demo with all features
npm start

# Query-specific demo
tsx src/examples/query_demo.ts

# Model operations demo
tsx src/examples/model_demo.ts

# GSI demo
tsx src/examples/gsi_demo.ts
```

## ✨ Key Features

### Type Safety
- **Zod schemas** for runtime validation and TypeScript inference
- **Compile-time index validation** for GSI/LSI names
- **Type-aware query operators** based on field types

### Modern Architecture
- **AWS SDK v3** with native value support
- **ESM modules** exclusively
- **Fluent query API** with comprehensive operators
- **Automatic expression building** for DynamoDB

### Advanced Querying
```typescript
// String field operations
.where('category').beginsWith('elect')
.filter('tags').contains('featured')

// Numeric field operations  
.filter('price').between(100, 500)
.filter('age').gte(18)

// Boolean operations
.filter('active').eq(true)

// Pagination
const page = await User.query({ id: 'user-1' })
  .limit(10)
  .execWithPagination();

// Streaming for large datasets
for await (const batch of User.query({ id: 'user-1' }).stream()) {
  // Process batch
}
```

### Secondary Indexes
```typescript
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  globalSecondaryIndexes: {
    'EmailIndex': { hashKey: 'email', projectionType: 'ALL' },
    'StatusIndex': { hashKey: 'status', projectionType: 'ALL' }
  }
});

// Type-safe index queries
const users = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')  // ✅ Compile-time validation
  .exec();
```

## 📁 Project Structure

```
dynogels-next/
├── lib_new/           # Modern TypeScript implementation
│   ├── src/
│   │   ├── Model.ts              # Base model class
│   │   ├── ModelFactory.ts       # Model factory
│   │   ├── TableManager.ts       # Table lifecycle utilities
│   │   ├── query/
│   │   │   ├── QueryBuilder.ts   # Fluent query API
│   │   │   ├── QueryConditions.ts
│   │   │   └── QueryExpressions.ts
│   │   └── types/                # Shared TypeScript types
│   ├── examples/                 # Usage examples
│   └── docs/                     # Architecture docs
└── legacy-lib/       # Original JavaScript implementation
```

## 🔧 Configuration

### Model Configuration
```typescript
interface ModelConfig {
  hashKey: string;                    // Required partition key
  rangeKey?: string;                  // Optional sort key
  schema: ZodSchema;                  // Validation schema
  tableName: string;                  // DynamoDB table name
  globalSecondaryIndexes?: GSIConfig; // GSI configuration
  localSecondaryIndexes?: LSIConfig;  // LSI configuration
  timestamps?: {                      // Auto timestamp handling
    createdAt?: boolean;
    updatedAt?: boolean;
  };
}
```

### Timestamp Handling
When enabled, automatically manages:
- `createdAt`: Set once on creation
- `updatedAt`: Updated on every modification
- Both use ISO 8601 format


### Composite Key Model
```typescript
const Product = factory.defineModel({
  hashKey: 'productId',
  rangeKey: 'category',
  schema: productSchema,
  tableName: 'products',
});

// Operations require both keys
const product = await Product.get({
  productId: 'prod-1',
  category: 'electronics',
});
```

### Batch Operations
```typescript
// Batch retrieve
const users = await User.getMany([
  { id: 'user-1' },
  { id: 'user-2' },
]);
```

### Table Management
```typescript
import { TableManager } from 'dynogels-next';

const tableManager = new TableManager(client);

// Create table
await tableManager.createTable(User, {
  readCapacity: 5,
  writeCapacity: 5,
});

// Check existence
const exists = await tableManager.tableExists('users');
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

- This is the **future implementation** - main library still in JavaScript
- **ESM modules only** - no CommonJS support
- Requires **Node.js 16+** for ESM and AWS SDK v3
- **Strict TypeScript** configuration ensures type safety
- Integration tests require **DynamoDB Local** or AWS access

## 🤝 Contributing

1. Work in the `lib_new/` directory
2. Follow TypeScript best practices
3. Add tests for new features
4. Use Biome for linting
5. Ensure type safety with Zod schemas

## 📄 License

See [LICENSE](legacy-lib/LICENSE) file for details.

---

For detailed architecture information, see [CLAUDE.md](CLAUDE.md).
