# SDK Design Principles

This document outlines the core design principles that guide the development of Dynogels Next, a modern DynamoDB data mapper for Node.js.

## 1. Promise-First Architecture

**Principle**: All database operations return Promises without callback support.

**Rationale**: 
- Aligns with modern JavaScript/TypeScript development practices
- Enables native async/await usage
- Simplifies error handling with try-catch blocks
- Better integration with modern frameworks and testing tools

**Implementation**:
```javascript
// ✅ Promise-based
const user = await User.get({ id: '123' });

// ❌ No callback support
User.get({ id: '123' }, callback); // Not supported
```

## 2. TypeScript-First Development

**Principle**: Built with TypeScript from the ground up with comprehensive type safety.

**Rationale**:
- Provides compile-time error checking
- Enhanced developer experience with IntelliSense
- Better maintainability and refactoring support
- Industry standard for modern Node.js libraries

**Implementation**:
- All core classes and interfaces are fully typed
- Generic type support for custom schema definitions
- Strict type checking for DynamoDB operations
- Export both TypeScript definitions and compiled JavaScript

## 3. Modern Schema Validation

**Principle**: Use Zod for runtime schema validation instead of legacy libraries.

**Rationale**:
- Better TypeScript integration and type inference
- More intuitive API design
- Smaller bundle size and better performance
- Active maintenance and modern feature set

**Implementation**:
```javascript
// Modern Zod schema
const userSchema = {
  id: z.string(),
  email: z.string().email(),
  age: z.number().optional()
};
```

## 4. AWS SDK v3 Integration

**Principle**: Built on AWS SDK v3 with modular imports and modern patterns.

**Rationale**:
- Smaller bundle sizes through modular imports
- Better performance and memory usage
- Future-proof with AWS's latest SDK
- Native Promise support without additional wrappers

**Implementation**:
- Use `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb`
- Leverage middleware and configuration patterns
- Support for modern AWS authentication methods

## 5. Minimal API Surface

**Principle**: Provide a clean, focused API that covers essential DynamoDB operations without unnecessary complexity.

**Rationale**:
- Easier to learn and adopt
- Reduced maintenance burden
- Lower chance of breaking changes
- Clear separation of concerns

**Implementation**:
- Core methods: `get()`, `create()`, `update()`, `destroy()`
- Focus on common use cases rather than edge cases
- Provide escape hatches for advanced DynamoDB features

## 6. Immutable Operations

**Principle**: Operations should not mutate input parameters, returning new instances when appropriate.

**Rationale**:
- Prevents unexpected side effects
- Better debugging and testing experience
- Aligns with functional programming principles
- Reduces bugs related to shared state

**Implementation**:
```javascript
// Operations return new instances
const updatedItem = await item.update(changes);
// Original item remains unchanged
```

## 7. Explicit Error Handling

**Principle**: All errors should be explicitly thrown as exceptions rather than hidden in callbacks.

**Rationale**:
- Clear error boundaries with try-catch blocks
- Better error propagation in async contexts
- Consistent error handling patterns
- Integration with modern error monitoring tools

**Implementation**:
```javascript
try {
  await model.get();
} catch (error) {
  // Handle specific DynamoDB errors
  if (error.code === 'ConditionalCheckFailedException') {
    // Handle conflict
  }
}
```

## 8. Performance by Default

**Principle**: Optimize for performance without sacrificing developer experience.

**Rationale**:
- DynamoDB operations are inherently expensive
- Reduce unnecessary AWS API calls
- Efficient serialization and deserialization
- Smart batching and connection pooling

**Implementation**:
- Lazy loading of table schemas
- Efficient attribute mapping
- Connection reuse and pooling
- Minimal object creation overhead

## 9. Testability First

**Principle**: Design APIs that are easy to test and mock.

**Rationale**:
- Enables comprehensive test coverage
- Supports test-driven development
- Reduces coupling between components
- Better development velocity

**Implementation**:
- Dependency injection for DynamoDB clients
- Clean interfaces for mocking
- Predictable behavior and side effects
- Support for DynamoDB Local testing

## 10. Zero Configuration Defaults

**Principle**: Provide sensible defaults that work out of the box while allowing customization.

**Rationale**:
- Faster time to value for developers
- Reduced cognitive overhead
- Best practices built into defaults
- Progressive disclosure of complexity

**Implementation**:
```javascript
// Works with minimal configuration
const User = defineModel('User', {
  hashKey: 'id',
  schema: userSchema
});

// But allows customization when needed
const User = defineModel('User', {
  hashKey: 'id',
  rangeKey: 'timestamp',
  schema: userSchema,
  indexes: {
    "email-index": {}
  }
});
```

## 11. Framework Agnostic

**Principle**: Work seamlessly with any Node.js framework or runtime environment.

**Rationale**:
- Broader adoption and use cases
- Avoid framework lock-in
- Maintain flexibility for different architectures
- Support for serverless and container environments

**Implementation**:
- No dependencies on specific web frameworks
- Environment-agnostic configuration
- Support for various deployment patterns
- Compatible with ESM and CommonJS modules

## 12. Backward Compatibility Strategy

**Principle**: Provide clear migration paths while embracing modern patterns.

**Rationale**:
- Easier adoption for existing Dynogels users
- Reduced migration friction
- Preserve institutional knowledge
- Incremental modernization support

**Implementation**:
- Migration guides and tooling
- Coexistence with legacy versions
- Clear deprecation timelines
- Automated migration where possible

## Implementation Guidelines

### Code Style
- Use Biome for consistent formatting
- Follow TypeScript strict mode guidelines
- Prefer composition over inheritance
- Use descriptive variable and method names

### Documentation
- Comprehensive API documentation with examples
- Migration guides from legacy versions
- Performance best practices
- Common patterns and anti-patterns

### Testing
- Unit tests for all core functionality
- Integration tests with DynamoDB Local
- Performance benchmarks
- Example applications demonstrating usage

### Versioning
- Semantic versioning (SemVer)
- Clear changelog documentation
- Deprecation warnings before breaking changes
- Long-term support for stable versions

These principles guide all architectural decisions and ensure that Dynogels Next remains a modern, maintainable, and developer-friendly DynamoDB mapper for the Node.js ecosystem.