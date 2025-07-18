# Reusable Components from QueryBuilder.ts

## Core Reusable Components

1. **Condition Builders**
   - `QueryConditions` and `StringQueryConditions` can be adapted for scan operations
   - Type-safe condition building pattern is reusable

2. **Expression Building**
   - `QueryExpressions` class handles:
     - Expression string generation
     - Attribute name/value management
     - Unique value key generation
   - Can be used directly for scan filter expressions

3. **Type Safety System**
   - Zod schema validation/inference
   - Field type awareness (string vs numeric methods)
   - Compile-time index validation pattern

4. **Result Handling**
   - Pagination (`execWithPagination`)
   - Streaming (`stream()`)
   - Batch processing (`loadAll()`)

## Implementation Notes

Key differences for scan operations:
- No key conditions (`where()` method not applicable)
- Filter expressions become primary filtering mechanism
- Performance considerations for large scans

## Architecture Recommendations

1. Reuse:
   - Expression building logic
   - Type safety infrastructure
   - Result handling patterns

2. Adapt:
   - Condition builders for scan-specific needs
   - Request building for scan parameters

3. Maintain:
   - Consistent type safety
   - Modular design
   - AWS SDK v3 integration