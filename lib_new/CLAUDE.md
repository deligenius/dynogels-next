# CLAUDE.md - TypeScript Implementation

This file provides guidance to Claude Code when working with the new TypeScript implementation of dynogels-next located in the `lib_new/` directory.

## Project Overview

This is the modern TypeScript rewrite of dynogels, a DynamoDB data mapper for Node.js. This implementation represents the future direction of the project with modern TypeScript patterns, AWS SDK v3, and ESM modules.

## Build and Test Commands

All commands should be run from the `lib_new/` directory:

### Development
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm run dev` - Run TypeScript compiler in watch mode
- `npm start` - Start the demo application using tsx
- `tsx src/app.ts` - Run the demo application directly

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

#### TableManager (`src/TableManager.ts`)
- **Purpose**: Handles DynamoDB table lifecycle operations
- **Key Methods**:
  - `createTable(model, throughput)` - Create table using model configuration
  - `deleteTable(tableName)` - Delete table
  - `tableExists(tableName)` - Check if table exists
  - `waitForTable(tableName, state)` - Wait for table to reach desired state

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
- `globalSecondaryIndexes?` - Optional GSI configuration with type-safe index names
- `localSecondaryIndexes?` - Optional LSI configuration with type-safe index names
- `timestamps?` - Optional timestamp configuration
  - `createdAt: boolean` - Auto-add creation timestamp
  - `updatedAt: boolean` - Auto-update modification timestamp

#### Timestamp Handling
- When enabled, automatically adds `createdAt` and `updatedAt` fields
- Timestamps are ISO 8601 strings
- `createdAt` set once on creation
- `updatedAt` updated on every modification

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

- This is the **future implementation** - the main library is still in JavaScript
- Uses **ESM modules** exclusively - no CommonJS support
- Requires **Node.js 16+** for ESM and AWS SDK v3 compatibility
- **AWS SDK v3** uses modular imports for smaller bundle sizes
- **Zod schemas** provide both runtime validation AND TypeScript types
- **Strict TypeScript** configuration ensures type safety
- Integration tests require **DynamoDB Local** or actual AWS DynamoDB access

## Demo Applications

### Main Demo (`src/app.ts`)
The main demo contains a comprehensive example showing:
- Model factory initialization
- Table creation and management
- All CRUD operations
- Batch operations
- Composite key handling
- Error handling patterns
- Graceful shutdown handling

Run with: `npm start` or `tsx src/app.ts`

### Query Demo (`src/query_demo.ts`)
A focused demo showing query functionality:
- Basic querying with key conditions
- Filter operations on non-key attributes
- Query options (limit, sort, pagination)
- Error handling for query operations

Run with: `tsx src/query_demo.ts`