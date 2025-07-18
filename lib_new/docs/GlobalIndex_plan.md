# Global Secondary Index (GSI) Support Plan

## Overview

This document outlines the implementation plan for adding comprehensive Global Secondary Index (GSI) support to the existing TypeScript Model and QueryBuilder architecture.

## Current State
- ✅ **Basic GSI Querying**: `usingIndex(indexName)` method exists
- ❌ **GSI Definition**: No schema-based GSI configuration
- ❌ **GSI Creation**: No automatic GSI table creation  
- ❌ **GSI Validation**: No query validation against GSI key schema

## Design Goals

### 1. Schema-First GSI Definition
- Define GSIs as part of model configuration
- Type-safe GSI key specification
- Automatic GSI creation during table setup

### 2. Enhanced QueryBuilder Integration  
- Automatic GSI key validation when using `usingIndex()`
- GSI-specific error messages
- Projection validation

### 3. GSI Management
- Create/update/delete GSIs programmatically
- GSI status monitoring and health checks

## Key Implementation Changes

### 1. GSI Configuration Types
```typescript
// Enhanced ModelConfig with GSI support
interface ModelConfig<T extends z.ZodObject<any>> {
  // ... existing fields
  globalSecondaryIndexes?: Record<string, GSIConfig<T>>;
  localSecondaryIndexes?: Record<string, LSIConfig<T>>;
}

interface GSIConfig<TSchema extends z.ZodObject<any>> {
  hashKey: keyof z.infer<TSchema>;
  rangeKey?: keyof z.infer<TSchema>;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  projectedAttributes?: (keyof z.infer<TSchema>)[];
  throughput?: { read: number; write: number };
}

// Type for extracting GSI index names
type GSIIndexNames<TConfig extends ModelConfig<any>> = 
  TConfig['globalSecondaryIndexes'] extends Record<string, any>
    ? keyof TConfig['globalSecondaryIndexes']
    : never;
```

### 2. Enhanced Model Class
- Add `indexMap` for runtime GSI validation
- Build index information from configuration  
- Pass `indexMap` to QueryBuilder for validation
- **Remove `queryGSI` method** - use existing `query().usingIndex()` pattern

### 3. Enhanced QueryBuilder
- Accept `indexMap` parameter for GSI validation
- **Type-safe `usingIndex(indexName)`** - only accepts defined index names
- Validate GSI keys in `usingIndex()` method
- Validate projection attributes
- Throw specific GSI errors

### 4. Enhanced TableManager  
- Build GSI definitions from model configuration
- Create GSIs during table creation
- Add GSI management methods (add/remove GSIs)

### 5. GSI Error Classes
```typescript
export class GSIValidationError extends Error {
  constructor(message: string, public indexName: string) {
    super(message);
  }
}
```

## Usage Examples

### GSI Model Definition
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
    'StatusDepartmentIndex': {
      hashKey: 'status', 
      rangeKey: 'department',
      projectionType: 'INCLUDE',
      projectedAttributes: ['email', 'role']
    }
  }
});
```

### GSI Queries
```typescript
// Query by email using EmailIndex GSI
const user = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex') // ✅ TypeScript validates index name exists
  .exec();

// Query active users in engineering with validation
const engineers = await User.query({ 
  status: 'active', 
  department: 'engineering' 
})
  .usingIndex('StatusDepartmentIndex') // ✅ Compile-time validated
  .filter('role').eq('admin')
  .projectionExpression('email, role') // ✅ Validated against projections
  .exec();

// Compile-time errors for invalid usage
await User.query({ invalidField: 'value' })
  .usingIndex('NonExistentIndex') // ❌ TypeScript error: index doesn't exist
  .exec();

await User.query({ invalidField: 'value' })
  .usingIndex('EmailIndex') // ❌ Runtime GSIValidationError: wrong key
  .exec();
```

## Implementation Phases

### Phase 1: Types and Configuration (1-2 days)
1. Add GSI configuration interfaces to ModelConfig
2. Create GSI validation error classes
3. Update Model constructor to build index map

### Phase 2: QueryBuilder Integration (2-3 days)  
1. Add indexMap parameter to QueryBuilder constructor
2. Enhance usingIndex() with GSI key validation
3. Add projection attribute validation
4. Update Model.query() to pass indexMap

### Phase 3: TableManager Enhancement (1-2 days)
1. Update createTable() to handle GSI definitions
2. Add GSI management methods (add/remove)
3. Enhance attribute definitions building

### Phase 4: Testing and Documentation (1 day)
1. Unit tests for GSI validation
2. Integration tests with actual DynamoDB
3. Update documentation and examples

## Key Benefits

### 1. Type Safety
- **Compile-time index name validation** - `usingIndex()` only accepts defined GSI names
- Schema-based GSI key validation at compile-time and runtime
- Projection attribute validation prevents runtime errors
- Full TypeScript IntelliSense for GSI operations

### 2. Developer Experience  
- Intuitive GSI configuration in model definition
- Clear, specific error messages for GSI misuse
- Automatic GSI creation with table setup
- Uses existing `query().usingIndex()` pattern

### 3. Performance
- Prevents invalid GSI queries before execution
- Projection validation reduces over-fetching
- Efficient GSI query routing

## Architecture Benefits

- **Backward Compatible**: Builds on existing QueryBuilder
- **Minimal API Changes**: No new methods, enhances existing ones
- **Type-Safe**: Full compile-time validation
- **Schema-Driven**: GSI config lives with model definition
- **Error-Explicit**: Specific GSI validation errors