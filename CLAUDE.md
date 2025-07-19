# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynogels Next is a modern TypeScript DynamoDB data mapper for Node.js built with AWS SDK v3, Zod schema validation, and comprehensive type safety. This represents a complete rewrite with modern TypeScript patterns, ESM modules, and Promise-first architecture.

## Build and Test Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm run dev` - Run TypeScript compiler in watch mode
- `npm start` - Start the demo application using tsx

### Testing
- `npm test` - Run all tests with Vitest
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only  
- `npm run test:coverage` - Run tests with coverage reporting

### Code Quality
- `npm run lint` - Run Biome linter
- `npm run format` - Format code (placeholder command)

## Architecture Overview

### Core Components

#### ModelFactory (`src/ModelFactory.ts`)
- **Purpose**: Factory for creating Model classes with specific configurations
- **Key Method**: `defineModel(config)` - Creates a new Model class with schema validation and table configuration
- **Usage**: `const User = factory.defineModel({ hashKey: 'id', schema: userSchema, tableName: 'users' })`

#### Model (`src/Model.ts`)
- **Purpose**: Base class for all DynamoDB models providing CRUD operations
- **Key Methods**:
  - `create(data)` - Insert new item
  - `get(primaryKey, options?)` - Retrieve single item
  - `getMany(primaryKeys)` - Batch retrieve multiple items
  - `update(primaryKey, updateData)` - Update existing item
  - `destroy(primaryKey)` - Delete item
  - `query(keyValues)` - Query items using key conditions
- **Features**: Automatic timestamp handling, schema validation, composite key support

#### QueryBuilder (`src/query/QueryBuilder.ts`)
- **Purpose**: Fluent API for building DynamoDB queries with conditions and options using AWS SDK v3 native types
- **Key Methods**:
  - `where(fieldName)` - Add key conditions (returns type-aware condition builder)
  - `filter(fieldName)` - Add filter conditions for non-key fields (returns type-aware condition builder)
  - `usingIndex(indexName)` - Query using a secondary index with **compile-time validation**
  - `limit(count)` - Limit number of items returned
  - `ascending()` / `descending()` - Control sort order (ScanIndexForward)
  - `consistentRead(enabled?)` - Enable/disable consistent reads
  - `startKey(key)` - Set pagination start key (ExclusiveStartKey)
  - `projectionExpression(expression)` - Specify attributes to return
  - `returnConsumedCapacity(level)` - Return capacity consumption info
  - `loadAll()` - Load all pages automatically (use with caution)
  - `exec()` - Execute query and return items array
  - `execWithPagination(lastKey?)` - Execute with pagination support
  - `stream()` - Stream results for large datasets (AsyncIterableIterator)
- **Features**: 
  - Type-safe field validation with Zod schema inference
  - **Index name validation**: Compile-time checking of GSI/LSI index names
  - Automatic expression building with native AWS SDK types
  - Separate condition classes for strings vs other types
  - Native value support (no manual AttributeValue conversion)
  - Comprehensive operator support (eq, gt, lt, between, in, contains, beginsWith, exists, etc.)

#### ScanBuilder (`src/scan/ScanBuilder.ts`)
- **Purpose**: Fluent API for building DynamoDB table scans with type-safe filtering
- **Key Methods**:
  - `filter(fieldName)` - Add filter conditions (all conditions go into FilterExpression)
  - `limit(count)` - Limit number of items returned per page
  - `segments(segment, totalSegments)` - Configure parallel scanning for large tables
  - `consistentRead(enabled?)` - Enable/disable consistent reads
  - `exec()` - Execute scan and return items array
  - `execWithPagination(lastKey?)` - Execute with pagination support
  - `stream()` - Stream results for memory-efficient processing (planned)
- **Features**:
  - Same type-safe operators as QueryBuilder (eq, gt, between, contains, etc.)
  - Parallel scanning support for better performance on large tables
  - Schema validation with Zod integration
  - AWS SDK v3 native value support

#### TableManager (`src/TableManager.ts`)
- **Purpose**: Handles DynamoDB table lifecycle operations
- **Key Methods**:
  - `createTable(model, throughput)` - Create table using model configuration
  - `deleteTable(tableName)` - Delete table
  - `tableExists(tableName)` - Check if table exists
  - `waitForTable(tableName, state)` - Wait for table to reach desired state

### Core Design Principles

This project follows specific design principles that guide all architectural decisions:

1. **Promise-First Architecture**: All database operations return Promises without callback support
2. **TypeScript-First Development**: Built with TypeScript from the ground up with comprehensive type safety
3. **Modern Schema Validation**: Uses Zod for runtime schema validation with better TypeScript integration
4. **AWS SDK v3 Integration**: Built on AWS SDK v3 with modular imports and native Promise support
5. **Minimal API Surface**: Clean, focused API covering essential DynamoDB operations
6. **Immutable Operations**: Operations don't mutate input parameters, returning new instances
7. **Explicit Error Handling**: All errors thrown as exceptions with try-catch blocks
8. **Performance by Default**: Optimized for performance without sacrificing developer experience
9. **Testability First**: Designed for easy testing and mocking with dependency injection
10. **Zero Configuration Defaults**: Sensible defaults that work out of the box

### Key Design Patterns

#### Schema-First Design
- Uses Zod for runtime schema validation and TypeScript type inference
- Automatic type safety from schema definitions
- Schema validation on create/update operations

```typescript
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().optional(),
});

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
});
```

#### Factory Pattern
- `ModelFactory` creates Model classes with specific configurations
- Supports both simple hash key and composite (hash + range) key models
- Configurable timestamp handling

#### Modern TypeScript Features
- Full ESM module support
- Strict TypeScript configuration
- AWS SDK v3 integration
- Type-safe CRUD operations

#### Flexible Query Design
- `query(keyValues)` accepts any key-value pairs and generates `eq` conditions automatically for KeyConditionExpression
- No distinction between hash/range keys - all provided keys become equality conditions in the key condition
- Use `where()` for additional key conditions (range key operations like `beginsWith`, `between`, `gt`, `lt`, etc.)
- Use `filter()` for non-key attribute filtering (goes into FilterExpression)
- Supports partial key queries for composite key models
- Type-safe field access with schema validation - only fields from Zod schema are allowed
- Automatic type inference for condition operators based on field types (string fields get `beginsWith()`, `contains()`, etc.)

### Configuration Options

#### Model Configuration (`ModelConfig`)
- `hashKey` - Primary partition key field name
- `rangeKey?` - Optional sort key field name  
- `schema` - Zod schema for validation and typing
- `tableName` - DynamoDB table name
- `globalSecondaryIndexes?` - Optional GSI configuration with compile-time index name validation
- `localSecondaryIndexes?` - Optional LSI configuration with compile-time index name validation
- `timestamps?` - Optional timestamp configuration
  - `createdAt: boolean` - Auto-add creation timestamp
  - `updatedAt: boolean` - Auto-update modification timestamp

#### Timestamp Handling
- When enabled, automatically adds `createdAt` and `updatedAt` fields
- Timestamps are ISO 8601 strings
- `createdAt` set once on creation
- `updatedAt` updated on every modification

#### Global Secondary Indexes (GSI)
- **Type-Safe Configuration**: GSI definitions with schema validation and compile-time index name checking
- **Flexible Schema**: Support for hash-only and composite key GSIs
- **Projection Types**: Support for 'ALL', 'KEYS_ONLY', and 'INCLUDE' projection types
- **Query Integration**: Seamless querying using `usingIndex(indexName)` with compile-time validation

```typescript
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
    }
  }
});

// Compile-time validated index usage
const usersByEmail = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')  // ✅ TypeScript validates this
  .exec();
```

### Architecture Details

#### Query System Architecture
The query system is built with multiple specialized components:

1. **QueryBuilder** (`src/query/QueryBuilder.ts`) - Main fluent interface
2. **QueryConditions** (`src/query/QueryConditions.ts`) - Type-aware condition builders
3. **QueryExpressions** (`src/query/QueryExpressions.ts`) - Expression compilation
4. **Query Types** (`src/types/Query.ts`) - TypeScript type definitions

#### Type Safety Features
- **Schema-based validation**: Only fields defined in Zod schema can be queried
- **Type-aware operators**: String fields get `beginsWith()`, `contains()`, numeric fields get range operations
- **Native value support**: Direct JavaScript types, no manual AttributeValue conversion
- **AWS SDK integration**: Uses `QueryCommandInput` and `NativeAttributeValue` types directly

#### Expression Building
- **Automatic key conditions**: `query(keyValues)` generates equality conditions for KeyConditionExpression
- **Separate filter handling**: `filter()` conditions go into FilterExpression  
- **Unique value keys**: Automatic generation of `:value_0`, `:value_1` to avoid conflicts
- **Attribute name escaping**: Uses `#fieldName` syntax for reserved word safety

### Dependencies

#### Core Dependencies
- **@aws-sdk/client-dynamodb** v3 - Core DynamoDB client
- **@aws-sdk/lib-dynamodb** v3 - Document client for simplified operations with native values
- **zod** - Runtime schema validation and TypeScript type inference

#### Development Dependencies
- **typescript** v5.5+ - TypeScript compiler
- **vitest** - Modern test runner with native TypeScript support
- **@vitest/coverage-v8** - Coverage reporting
- **tsx** - TypeScript execution for development

## Usage Examples

### Basic Model Definition
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory } from './index.js';

const client = new DynamoDBClient({ region: 'us-east-1' });
const factory = new ModelFactory(client);

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  timestamps: { createdAt: true, updatedAt: true },
});
```

### CRUD Operations
```typescript
// Create
const user = await User.create({
  id: 'user-1',
  email: 'john@example.com',
  name: 'John Doe',
});

// Read
const retrieved = await User.get({ id: 'user-1' });

// Update
const updated = await User.update(
  { id: 'user-1' },
  { name: 'John Smith' }
);

// Delete
await User.destroy({ id: 'user-1' });

// Batch operations
const users = await User.getMany([
  { id: 'user-1' },
  { id: 'user-2' },
]);
```

### Composite Key Models
```typescript
const productSchema = z.object({
  productId: z.string(),
  category: z.string(),
  name: z.string(),
  price: z.number(),
});

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

### Query Operations

#### Basic Hash Key Query
```typescript
// Query by hash key only (returns all items with that hash key)
const userItems = await User.query({ id: 'user-1' }).exec();
```

#### Composite Key Query
```typescript
// Query with both hash and range key (exact match)
const product = await Product.query({ 
  productId: 'prod-1', 
  category: 'electronics' 
}).exec();

// Query with hash key only (returns all items with that productId)
const allProductVersions = await Product.query({ 
  productId: 'prod-1' 
}).exec();
```

#### Query with Additional Conditions
```typescript
// Query with hash key and filter conditions
const activeUsers = await User.query({ id: 'user-1' })
  .filter('status').eq('active')
  .filter('age').gte(18)
  .exec();

// Query with range key conditions (for composite keys)
const electronicProducts = await Product.query({ productId: 'prod-1' })
  .where('category').beginsWith('elect')
  .exec();

// Query with multiple operators on different field types
const complexQuery = await Product.query({ productId: 'prod-1' })
  .where('category').beginsWith('electronics')  // String field gets string methods
  .filter('price').between(100, 500)            // Number field gets numeric methods
  .filter('inStock').eq(true)                   // Boolean field gets equality methods
  .filter('tags').contains('featured')          // String field for array/substring contains
  .exec();
```

#### Query Options
```typescript
// Query with various options
const results = await User.query({ id: 'user-1' })
  .filter('status').eq('active')
  .limit(10)
  .ascending()
  .consistentRead(true)
  .projectionExpression('id, #name, email')  // Specify attributes to return
  .returnConsumedCapacity('TOTAL')           // Get capacity consumption info
  .exec();

// Paginated query
const page = await User.query({ id: 'user-1' })
  .limit(10)
  .execWithPagination();

console.log('Items:', page.items);
console.log('Last key:', page.lastEvaluatedKey);
console.log('Count:', page.count);
console.log('Scanned count:', page.scannedCount);
console.log('Consumed capacity:', page.consumedCapacity);

// Continue pagination with startKey
const nextPage = await User.query({ id: 'user-1' })
  .startKey(page.lastEvaluatedKey)
  .limit(10)
  .execWithPagination();
```

#### Streaming Large Result Sets
```typescript
// Stream results for large datasets
for await (const batch of User.query({ id: 'user-1' }).stream()) {
  console.log(`Processing batch of ${batch.length} items`);
  // Process each batch of items
  for (const item of batch) {
    console.log(`Processing user: ${item.name}`);
  }
}

// Load all results at once (use with caution for large datasets)
const allResults = await User.query({ id: 'user-1' })
  .filter('status').eq('active')
  .loadAll()
  .exec();

console.log(`Found ${allResults.length} active users`);
```

### Scanning Operations

#### Basic Table Scans
```typescript
// Scan all items in table
const allUsers = await User.scan().exec();

// Scan with filters
const activeUsers = await User.scan()
  .filter('status').eq('active')
  .filter('age').between(25, 45)
  .exec();
```

#### Parallel Scanning for Large Tables
```typescript
// Divide scan across 4 segments for better performance
const segment0 = await User.scan()
  .segments(0, 4)
  .filter('status').eq('active')
  .exec();

const segment1 = await User.scan()
  .segments(1, 4)
  .filter('status').eq('active')
  .exec();

// Or use Promise.all for concurrent scanning
const promises = Array.from({ length: 4 }, (_, i) =>
  User.scan()
    .segments(i, 4)
    .filter('status').eq('active')
    .exec()
);
const results = await Promise.all(promises);
const allResults = results.flat();
```

#### Index Queries with Type Safety
```typescript
// Model with GSI configuration
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  globalSecondaryIndexes: {
    'EmailIndex': {
      hashKey: 'email',
      projectionType: 'ALL'
    },
    'StatusIndex': {
      hashKey: 'status',
      projectionType: 'ALL'
    }
  }
});

// Query using a secondary index - index names are validated at compile time
const usersByEmail = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')         // ✅ Valid index name
  .exec();

// Query index with additional filters
const recentActiveUsers = await User.query({ status: 'active' })
  .usingIndex('StatusIndex')        // ✅ Valid index name
  .filter('createdAt').gte('2023-01-01')
  .exec();

// Invalid index names cause TypeScript compile errors
const invalidQuery = await User.query({ status: 'active' })
  .usingIndex('NonExistentIndex'); // ❌ TypeScript error: not assignable to IndexNames<TConfig>
```

## Development Workflow

1. **Model Development**: Define schemas using Zod, create models with ModelFactory
2. **Table Management**: Use TableManager for table lifecycle operations
3. **Testing**: Write tests using Vitest with TypeScript support
4. **Type Safety**: Leverage TypeScript's strict mode and Zod inference
5. **Build**: Compile TypeScript to dist/ directory for distribution

## Implementation Status

### Completed Features ✅
- **QueryBuilder** - Full implementation with fluent API
- **Type-safe conditions** - String/numeric/boolean field type awareness  
- **Expression building** - Automatic KeyConditionExpression and FilterExpression generation
- **AWS SDK v3 integration** - Native value support with QueryCommandInput
- **Pagination support** - execWithPagination(), startKey(), stream()
- **Index queries** - usingIndex() with **compile-time index name validation**
- **Schema validation** - Zod-based field validation and result parsing
- **GSI/LSI support** - Full Global and Local Secondary Index support with type safety

### Architecture Highlights
- **Type Safety**: Full TypeScript support with Zod schema inference
- **Native Values**: Uses AWS SDK's `NativeAttributeValue` - no manual conversion needed
- **Modular Design**: Separate classes for QueryBuilder, QueryConditions, and QueryExpressions
- **Field Type Awareness**: String fields automatically get `beginsWith()`, `contains()` methods
- **Expression Safety**: Automatic attribute name escaping and unique value key generation
- **Index Validation**: Compile-time checking of GSI/LSI index names with `IndexNames<TConfig>` type

## Important Notes

- Uses **ESM modules** exclusively - no CommonJS support
- Requires **Node.js 16+** for ESM and AWS SDK v3 compatibility
- **AWS SDK v3** uses modular imports for smaller bundle sizes
- **Zod schemas** provide both runtime validation AND TypeScript types
- **Strict TypeScript** configuration ensures type safety
- Integration tests require **DynamoDB Local** or actual AWS DynamoDB access
- **Promise-first architecture** - no callback support
- All operations are immutable and don't mutate input parameters

## Demo Applications

The `src/examples/` directory contains comprehensive demos showing various features:

### Model Demo (`src/examples/model_demo.ts`)
Comprehensive example showing:
- Model factory initialization and table management
- All CRUD operations (create, get, update, destroy)
- Batch operations with getMany
- Composite key handling
- Error handling patterns

### Query Demo (`src/examples/query_demo.ts`)
Focused demo showing query functionality:
- Basic querying with key conditions
- Filter operations on non-key attributes
- Query options (limit, sort, pagination)
- Error handling for query operations

### GSI Demo (`src/examples/gsi_demo.ts`)
Demonstrates Global Secondary Index features:
- GSI configuration with type safety
- Querying using different index patterns
- Compile-time index name validation
- Performance considerations

Run any demo with: `tsx src/examples/<filename>.ts`