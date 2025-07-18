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
- **Features**: Automatic timestamp handling, schema validation, composite key support

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

### Configuration Options

#### Model Configuration (`ModelConfig`)
- `hashKey` - Primary partition key field name
- `rangeKey?` - Optional sort key field name  
- `schema` - Zod schema for validation and typing
- `tableName` - DynamoDB table name
- `timestamps?` - Optional timestamp configuration
  - `createdAt: boolean` - Auto-add creation timestamp
  - `updatedAt: boolean` - Auto-update modification timestamp

#### Timestamp Handling
- When enabled, automatically adds `createdAt` and `updatedAt` fields
- Timestamps are ISO 8601 strings
- `createdAt` set once on creation
- `updatedAt` updated on every modification

### Dependencies

#### Core Dependencies
- **@aws-sdk/client-dynamodb** v3 - Core DynamoDB client
- **@aws-sdk/lib-dynamodb** v3 - Document client for simplified operations
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

## Development Workflow

1. **Model Development**: Define schemas using Zod, create models with ModelFactory
2. **Table Management**: Use TableManager for table lifecycle operations
3. **Testing**: Write tests using Vitest with TypeScript support
4. **Type Safety**: Leverage TypeScript's strict mode and Zod inference
5. **Build**: Compile TypeScript to dist/ directory for distribution

## Important Notes

- This is the **future implementation** - the main library is still in JavaScript
- Uses **ESM modules** exclusively - no CommonJS support
- Requires **Node.js 16+** for ESM and AWS SDK v3 compatibility
- **AWS SDK v3** uses modular imports for smaller bundle sizes
- **Zod schemas** provide both runtime validation AND TypeScript types
- **Strict TypeScript** configuration ensures type safety
- Integration tests require **DynamoDB Local** or actual AWS DynamoDB access

## Demo Application

The `src/app.ts` file contains a comprehensive demo showing:
- Model factory initialization
- Table creation and management
- All CRUD operations
- Batch operations
- Composite key handling
- Error handling patterns
- Graceful shutdown handling

Run with: `npm start` or `tsx src/app.ts`