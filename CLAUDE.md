# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynogels is a DynamoDB data mapper for Node.js, forked from Vogels. The repository contains both the original JavaScript implementation (main library) and a new TypeScript rewrite (lib_new directory).

## Build and Test Commands

### Main Library (JavaScript)
- `npm run lint` - Run ESLint on the codebase
- `npm test` or `make test` - Run both unit and integration tests
- `make test-unit` - Run unit tests only
- `make test-integration` - Run integration tests only
- `make coverage` - Generate code coverage reports using Istanbul
- `make lint` - Run linting via Makefile

### New TypeScript Implementation (lib_new/)
- `cd lib_new && npm run dev` - Run development server with nodemon and ts-node
- `cd lib_new && npm start` - Start the application
- `cd lib_new && npm run tsc` - Compile TypeScript

## Architecture Overview

### Main Library Structure
- **index.js** - Entry point that exports lib/index.js
- **lib/index.js** - Core module that exposes the main dynogels API
- **lib/table.js** - Table class handling DynamoDB operations
- **lib/schema.js** - Schema definition and validation using Joi
- **lib/item.js** - Item class representing individual DynamoDB records
- **lib/query.js** - Query builder for DynamoDB queries
- **lib/scan.js** - Scan operations for table scanning
- **lib/batch.js** - Batch operations (getItems, batchGetItems)
- **lib/serializer.js** - Data serialization/deserialization
- **lib/expressions.js** - DynamoDB expression handling
- **lib/createTables.js** - Table creation utilities

### Key Design Patterns
- **Model Factory Pattern**: `dynogels.define()` creates model constructors that inherit from Item
- **Fluent API**: Chainable query and scan builders
- **Schema-based Validation**: Uses Joi for data validation
- **AWS SDK Integration**: Wraps AWS DynamoDB DocumentClient

### New Implementation (lib_new/)
- **TypeScript-based**: Complete rewrite using modern TypeScript
- **ESM Modules**: Uses ES modules instead of CommonJS
- **AWS SDK v3**: Migrated to latest AWS SDK
- **Zod Validation**: Uses Zod instead of Joi for schema validation

## Development Workflow

1. **Main library changes**: Work in the root directory and lib/ folder
2. **New implementation**: Work in lib_new/ directory
3. **Testing**: Always run both unit and integration tests before committing
4. **Linting**: Ensure code passes ESLint checks

## Dependencies

### Main Library
- **aws-sdk** v2 - DynamoDB operations
- **joi** - Schema validation
- **lodash** - Utility functions
- **async** - Async flow control

### New Implementation  
- **@aws-sdk/client-dynamodb** v3 - Modern AWS SDK
- **@aws-sdk/lib-dynamodb** v3 - DynamoDB document client
- **zod** - Schema validation
- **typescript** - TypeScript support

## Important Notes

- The project is in transition from JavaScript to TypeScript
- Both implementations should be maintained until migration is complete
- Integration tests require actual DynamoDB access or DynamoDB Local
- The lib_new/ directory represents the future direction of the project