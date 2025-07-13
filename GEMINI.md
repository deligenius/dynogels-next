# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

## Project Overview

Dynogels is a DynamoDB data mapper for Node.js, forked from Vogels. The repository contains both the original JavaScript implementation (in the root and `lib` directory) and a new TypeScript rewrite (in the `lib_new` directory).

## Build and Test Commands

### Main Library (JavaScript)
- **Lint:** `npm run lint` or `make lint`
- **Test:** `npm test` or `make test` (runs unit and integration tests)
- **Unit Tests:** `make test-unit`
- **Integration Tests:** `make test-integration`
- **Coverage:** `make coverage`

### New TypeScript Implementation (`lib_new/`)
- **Run Dev Server:** `cd lib_new && npm run dev`
- **Start App:** `cd lib_new && npm start`
- **Compile TypeScript:** `cd lib_new && npm run tsc`

## Architecture Overview

### Main Library Structure
- **`index.js`**: Main entry point, exports `lib/index.js`.
- **`lib/index.js`**: Core module exposing the main dynogels API.
- **`lib/table.js`**: `Table` class for DynamoDB operations.
- **`lib/schema.js`**: Schema definition and validation using Joi.
- **`lib/item.js`**: `Item` class representing a DynamoDB record.
- **`lib/query.js`**: Query builder for DynamoDB queries.
- **`lib/scan.js`**: Scan operation builder.
- **`lib/batch.js`**: Batch get operations.
- **`lib/serializer.js`**: Data serialization/deserialization.
- **`lib/expressions.js`**: DynamoDB expression handling.
- **`lib/createTables.js`**: Table creation utilities.

### New Implementation (`lib_new/`)
- **Stack:** Modern TypeScript with ESM modules.
- **AWS SDK:** Uses AWS SDK v3.
- **Validation:** Uses Zod for schema validation instead of Joi.
- **Directory:** All new code is located in `lib_new/`.

## Development Workflow

1.  For changes to the main library, work in the root and `lib/` folders.
2.  For the new implementation, work in the `lib_new/` directory.
3.  Always run tests before committing changes.
4.  Ensure code passes linting checks.

## Dependencies

### Main Library
- **`aws-sdk`**: AWS SDK v2 for DynamoDB operations.
- **`joi`**: Schema validation.
- **`lodash`**: Utility functions.
- **`async`**: Asynchronous flow control.

### New Implementation
- **`@aws-sdk/client-dynamodb`**: AWS SDK v3 client.
- **`@aws-sdk/lib-dynamodb`**: DynamoDB DocumentClient from AWS SDK v3.
- **`zod`**: Schema validation.
- **`typescript`**: Language support.

## Important Notes

- The project is migrating from JavaScript to TypeScript.
- Both implementations are active.
- Integration tests require DynamoDB (local or remote).
- The `lib_new/` directory contains the future direction of the project.
