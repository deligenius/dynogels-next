# Dynogels Legacy Tests

Comprehensive test suite for the legacy JavaScript dynogels implementation, designed to work with DynamoDB Local.

## Prerequisites

### DynamoDB Local Setup

You need DynamoDB Local running on `localhost:8000` before running the tests.

#### Option 1: Docker (Recommended)
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

#### Option 2: Java JAR
1. Download DynamoDB Local from AWS
2. Run:
```bash
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

### Install Dependencies
```bash
npm install
```

## Test Files

### Core Test Files
- **`test-helper.js`** - Enhanced test utilities and helpers
- **`local-dynamo-test.js`** - Comprehensive integration tests with local DynamoDB
- **`end-to-end-test.js`** - Complex application workflow tests
- **`performance-test.js`** - Performance benchmarking tests

### Existing Test Files
- **`index-test.js`** - Core dynogels functionality tests
- **`table-test.js`** - Table operations tests
- **`query-test.js`** - Query builder tests
- **`scan-test.js`** - Scan operations tests
- **`batch-test.js`** - Batch operations tests
- **`schema-test.js`** - Schema validation tests
- **`item-test.js`** - Item model tests
- **`expressions-test.js`** - DynamoDB expressions tests
- **`parallel-test.js`** - Parallel scan tests
- **`serializer-test.js`** - Data serialization tests

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Files
```bash
# Core functionality tests
npm run test-unit

# Integration tests  
npm run test-integration

# Local DynamoDB integration tests
./node_modules/.bin/mocha test/local-dynamo-test.js

# End-to-end workflow tests
./node_modules/.bin/mocha test/end-to-end-test.js

# Performance tests
./node_modules/.bin/mocha test/performance-test.js
```

### With Coverage
```bash
make coverage
```

## Test Categories

### 1. Local DynamoDB Integration Tests (`local-dynamo-test.js`)

Comprehensive tests covering:
- **User CRUD Operations**: Create, read, update, delete users with validation
- **BlogPost Operations**: Hash/range key operations, queries, filters
- **Comment Operations**: Nested data structures, relationships
- **Product Operations**: Complex data types, sets, nested objects
- **Batch Operations**: Batch get, consistent reads, large datasets
- **Advanced Queries**: GSI queries, expression filters, parallel scans
- **Error Handling**: Validation errors, conditional checks, edge cases

### 2. End-to-End Application Tests (`end-to-end-test.js`)

Simulates complete application workflows:
- **User Journey**: Registration → Organization setup → Project creation → Task management
- **Complex Data Models**: Users, Organizations, Projects, Tasks, Activity Logs
- **Multi-Table Operations**: Cross-table relationships and operations
- **Real-World Scenarios**: Project management workflow with full data lifecycle
- **Reporting & Analytics**: Complex queries across multiple tables
- **Performance Metrics**: Statistics and completion rates

### 3. Performance Tests (`performance-test.js`)

Benchmarks various operations:
- **Bulk Data Creation**: Sequential vs parallel operations (1000+ items)
- **Query Performance**: Batch gets, scans, GSI queries with different page sizes
- **Update Performance**: Sequential vs parallel updates
- **Complex Workflows**: Order creation, logging operations
- **Concurrency Testing**: Multiple concurrent operations
- **Performance Metrics**: Throughput, latency, and optimization recommendations

### 4. Enhanced Test Helpers (`test-helper.js`)

Extended utilities:
- **Local DynamoDB Setup**: Easy configuration for localhost:8000
- **Data Generation**: Realistic test data for various models
- **Promise Wrappers**: Convert callback APIs to async/await
- **Performance Measurement**: Built-in benchmarking helpers
- **Validation Helpers**: Common assertions for models and errors
- **Table Management**: Automated table creation/cleanup

## Example Usage

### Basic Test Structure
```javascript
const dynogels = require('../index');
const helper = require('./test-helper');
const { expect } = require('chai');

// Configure for local DynamoDB
dynogels.AWS.config.update({
  endpoint: 'http://localhost:8000',
  region: 'localhost',
  accessKeyId: 'test',
  secretAccessKey: 'test'
});

// Define model
const User = dynogels.define('TestUser', {
  hashKey: 'id',
  timestamps: true,
  schema: {
    id: dynogels.types.uuid(),
    email: Joi.string().email().required(),
    name: Joi.string().required()
  }
});

// Create table and run tests
before(async () => {
  await helper.promisify.createTable(User);
  await helper.waitForTableActive(User);
});

after(async () => {
  await helper.cleanupTable(User);
});

it('should create and retrieve user', async () => {
  const userData = helper.generateTestData.user(1);
  const user = await helper.promisify.create(User, userData);
  
  expect(user.get('email')).to.equal(userData.email);
  helper.expectValidTimestamps(user);
});
```

### Using Performance Helpers
```javascript
const perfCreate = helper.measurePerformance(
  helper.promisify.create.bind(null, User),
  'User Creation'
);

const { result, duration } = await perfCreate(userData);
console.log(`User created in ${duration}ms`);
```

### Batch Operations
```javascript
const users = Array.from({ length: 100 }, (_, i) => 
  helper.generateTestData.user(i)
);

const createdUsers = await helper.createInBatches(User, users, 25);
expect(createdUsers).to.have.length(100);
```

## Test Data Patterns

### Realistic Test Data
The helpers generate realistic test data:
- **Users**: Emails, names, settings, roles, metadata
- **Blog Posts**: Content, categories, tags, view counts
- **Products**: Names, prices, ratings, complex nested data
- **Orders**: Items, totals, addresses, payment methods

### Configurable Variations
Data generation includes realistic variations:
- Different user roles and permissions
- Various product categories and price ranges
- Multiple geographical locations
- Randomized but deterministic data patterns

## Performance Benchmarks

The performance tests provide insights into:
- **Creation Throughput**: Items per second for different models
- **Query Performance**: Response times for various query patterns  
- **Batch Efficiency**: Optimal batch sizes for operations
- **Concurrency Impact**: Performance gains from parallel operations
- **Scaling Characteristics**: How performance changes with data size

### Expected Performance (Local DynamoDB)
- **User Creation**: 50-200 users/second (depending on complexity)
- **Batch Gets**: 2-5ms per item in batches of 25-100
- **Simple Queries**: 10-50ms response time
- **Parallel Operations**: 2-5x improvement over sequential

## Best Practices

### Test Organization
1. **Setup/Teardown**: Always create/destroy tables per test suite
2. **Data Isolation**: Use unique identifiers to avoid test conflicts
3. **Error Testing**: Include both success and failure scenarios
4. **Performance**: Measure and assert performance characteristics

### DynamoDB Testing
1. **Consistent Reads**: Use when testing immediate consistency
2. **Table Management**: Wait for ACTIVE status before operations
3. **Cleanup**: Always cleanup tables to avoid conflicts
4. **Batch Limits**: Respect DynamoDB batch operation limits (25/100 items)

### Debugging
1. **Verbose Logging**: Enable detailed logging for debugging
2. **Performance Metrics**: Monitor operation timing
3. **Error Details**: Capture full error context
4. **Data Validation**: Verify data integrity throughout tests

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Start DynamoDB Local
  run: docker run -d -p 8000:8000 amazon/dynamodb-local

- name: Wait for DynamoDB
  run: sleep 5

- name: Run Tests
  run: npm test
```

### Test Timeouts
- **Unit Tests**: 5-10 seconds
- **Integration Tests**: 30-60 seconds  
- **Performance Tests**: 2-5 minutes
- **End-to-End Tests**: 1-2 minutes

## Troubleshooting

### Common Issues

**DynamoDB Connection Errors**
- Ensure DynamoDB Local is running on port 8000
- Check firewall settings
- Verify endpoint configuration

**Table Already Exists Errors**  
- Ensure proper cleanup in test teardown
- Use unique table names per test run
- Check for hanging table creation operations

**Performance Issues**
- Reduce test data size for faster execution
- Use parallel operations where appropriate
- Monitor DynamoDB Local resource usage

**Timeout Errors**
- Increase test timeouts for complex operations
- Check for proper async/await usage
- Verify table active status before operations

### Debug Configuration
```javascript
// Enable detailed AWS SDK logging
process.env.AWS_SDK_LOAD_CONFIG = 1;
process.env.AWS_SDK_LOG_LEVEL = 'debug';

// Enable dynogels logging
dynogels.log = {
  info: console.log,
  warn: console.warn
};
```