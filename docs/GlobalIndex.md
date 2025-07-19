# Global Secondary Index Documentation

## Overview

Global Secondary Indexes (GSI) provide an alternative access pattern for DynamoDB queries, allowing you to query on non-key attributes. The implementation provides type-safe GSI configuration and querying with compile-time validation.

## Features

- **Type-Safe Configuration**: GSI definitions with schema validation
- **Compile-Time Validation**: Index names are validated at TypeScript compile time
- **Query Integration**: Seamless querying using `usingIndex()` method
- **Flexible Schema**: Support for hash-only and composite key GSIs

## Configuration

### GSI Definition in Model Config

```typescript
interface ModelConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName: string;
  globalSecondaryIndexes?: Record<string, GSIConfig<T>>;
  localSecondaryIndexes?: Record<string, LSIConfig<T>>;
}

interface GSIConfig<TSchema extends z.ZodObject<any>> {
  hashKey: keyof z.infer<TSchema>;
  rangeKey?: keyof z.infer<TSchema>;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  projectedAttributes?: (keyof z.infer<TSchema>)[];
}
```

### Example Model with GSI

```typescript
import { z } from 'zod';

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

## Querying with GSI

### Basic GSI Queries

#### Hash-Only GSI
```typescript
// Query by email using EmailIndex
const userByEmail = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')
  .exec();

// Query by status using StatusIndex
const activeUsers = await User.query({ status: 'active' })
  .usingIndex('StatusIndex')
  .exec();
```

#### Composite Key GSI
```typescript
// Query with both hash and range key
const engineeringActiveUsers = await User.query({ 
  department: 'engineering', 
  status: 'active' 
})
  .usingIndex('DepartmentStatusIndex')
  .exec();

// Query with hash key only
const allEngineering = await User.query({ department: 'engineering' })
  .usingIndex('DepartmentStatusIndex')
  .exec();

// Query with hash key and range key condition
const engineeringUsers = await User.query({ department: 'engineering' })
  .usingIndex('DepartmentStatusIndex')
  .where('status').beginsWith('act')
  .exec();
```

### Advanced GSI Queries

#### With Filters
```typescript
// GSI query with additional filters
const recentActiveUsers = await User.query({ status: 'active' })
  .usingIndex('StatusIndex')
  .filter('lastLogin').gte('2023-01-01')
  .filter('department').eq('engineering')
  .exec();
```

#### With Pagination
```typescript
// Paginated GSI query
const result = await User.query({ department: 'engineering' })
  .usingIndex('DepartmentStatusIndex')
  .limit(50)
  .execWithPagination();

console.log('Users:', result.items);
console.log('Last key:', result.lastEvaluatedKey);

// Continue pagination
const nextPage = await User.query({ department: 'engineering' })
  .usingIndex('DepartmentStatusIndex')
  .startKey(result.lastEvaluatedKey)
  .limit(50)
  .execWithPagination();
```

## Type Safety Features

### Compile-Time Index Name Validation

TypeScript validates index names at compile time, preventing runtime errors:

```typescript
// Model with defined GSIs
const User = factory.defineModel({
  hashKey: 'id',
  schema: userSchema,
  tableName: 'users',
  globalSecondaryIndexes: {
    'EmailIndex': { hashKey: 'email', projectionType: 'ALL' },
    'StatusIndex': { hashKey: 'status', projectionType: 'ALL' }
  }
});

// ✅ Valid index names are accepted
const query1 = User.query({ email: 'test@example.com' })
  .usingIndex('EmailIndex');        // ✅ Compile-time validation passes

const query2 = User.query({ status: 'active' })
  .usingIndex('StatusIndex');       // ✅ Compile-time validation passes

// ❌ Invalid index names cause TypeScript errors
const query3 = User.query({ status: 'active' })
  .usingIndex('NonExistentIndex'); // ❌ TS Error: not assignable to IndexNames<TConfig>
```

### IDE Support

The type system provides excellent developer experience:

- **IntelliSense**: IDE autocomplete for valid index names
- **Error Detection**: Compile-time validation prevents runtime errors  
- **Type Safety**: Only valid indexes from model configuration can be used
- **No Runtime Overhead**: All validation happens at compile time

### Index Configuration Typing

GSI configurations are fully typed based on your schema:

```typescript
// All keys must exist in the schema
globalSecondaryIndexes: {
  'EmailIndex': {
    hashKey: 'email',          // ✅ Must be keyof z.infer<TSchema>
    projectionType: 'ALL'
  },
  'InvalidIndex': {
    hashKey: 'nonExistentField' // ❌ TypeScript error
  }
}
```

## Best Practices

### GSI Design Patterns

#### 1. Hash-Only GSI for Unique Lookups
```typescript
// Good for unique attribute lookups
'EmailIndex': {
  hashKey: 'email',
  projectionType: 'ALL'
}

// Usage: Find user by email
const user = await User.query({ email: 'john@example.com' })
  .usingIndex('EmailIndex')
  .exec();
```

#### 2. Composite GSI for Range Queries
```typescript
// Good for queries within a group
'DepartmentStatusIndex': {
  hashKey: 'department',
  rangeKey: 'status',
  projectionType: 'INCLUDE',
  projectedAttributes: ['email', 'lastLogin']
}

// Usage: Find active users in engineering
const activeEngineers = await User.query({ 
  department: 'engineering',
  status: 'active' 
})
  .usingIndex('DepartmentStatusIndex')
  .exec();
```

#### 3. Projection Optimization
```typescript
// Use KEYS_ONLY for count queries
'StatusIndex': {
  hashKey: 'status',
  projectionType: 'KEYS_ONLY'  // Minimal data transfer
}

// Use INCLUDE for specific attributes
'UserRoleIndex': {
  hashKey: 'role',
  projectionType: 'INCLUDE',
  projectedAttributes: ['email', 'department'] // Only include needed attributes
}

// Use ALL when you need all attributes
'EmailIndex': {
  hashKey: 'email',
  projectionType: 'ALL'  // Full item data
}
```

### Performance Tips

1. **Choose appropriate projection**: Use KEYS_ONLY or INCLUDE when possible
2. **Avoid over-indexing**: Each GSI adds cost and complexity
3. **Consider query patterns**: Design GSIs based on actual query needs
4. **Use sparse indexes**: GSI will only include items that have the GSI keys