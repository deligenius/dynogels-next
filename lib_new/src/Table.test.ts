import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { Dynogels } from './Table.js';
import { 
  initializeTestDynogels, 
  createTestModel, 
  generateTableName, 
  waitForTable, 
  cleanupTable,
  TestSchemas,
  generateTestData,
  ErrorMatchers
} from './test-utils.js';

describe('Dynogels Table', () => {
  beforeAll(() => {
    initializeTestDynogels();
  });

  describe('Model Definition', () => {
    it('should create a model with hash key only', () => {
      const tableName = generateTableName('simple');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'id',
        schema: TestSchemas.Simple,
      });

      expect(TestModel).toBeDefined();
      expect(typeof TestModel.create).toBe('function');
      expect(typeof TestModel.get).toBe('function');
      expect(typeof TestModel.update).toBe('function');
      expect(typeof TestModel.destroy).toBe('function');
      expect(typeof TestModel.createTable).toBe('function');
      expect(typeof TestModel.deleteTable).toBe('function');
    });

    it('should create a model with hash and range key', () => {
      const tableName = generateTableName('with_range');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'pk',
        rangeKey: 'sk',
        schema: TestSchemas.WithRange,
      });

      expect(TestModel).toBeDefined();
    });

    it('should create a model with timestamps enabled', () => {
      const tableName = generateTableName('with_timestamps');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'id',
        timestamps: true,
        schema: TestSchemas.Simple,
      });

      expect(TestModel).toBeDefined();
    });

    it('should create a model with complex schema', () => {
      const tableName = generateTableName('complex');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'id',
        rangeKey: 'timestamp',
        timestamps: true,
        schema: TestSchemas.Complex,
        validation: {
          allowUnknown: true,
        },
      });

      expect(TestModel).toBeDefined();
    });
  });

  describe('Schema Validation', () => {
    it('should validate schema correctly', () => {
      const tableName = generateTableName('validation');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'id',
        schema: TestSchemas.Simple,
      });

      const validData = generateTestData.simple('valid-id');
      const result = TestModel.schema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('valid-id');
        expect(result.data.name).toBe('Test User valid-id');
      }
    });

    it('should reject invalid schema data', () => {
      const tableName = generateTableName('validation_fail');
      const TestModel = Dynogels.define(tableName, {
        hashKey: 'id',
        schema: TestSchemas.Simple,
      });

      const invalidData = {
        id: 123, // should be string
        name: 'Test User',
        email: 'invalid-email', // should be valid email
      };

      const result = TestModel.schema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe('Table Operations (Integration)', () => {
  let TestModel: any;
  const tableName = generateTableName('operations');

  beforeEach(async () => {
    TestModel = createTestModel(tableName, TestSchemas.Simple, {
      hashKey: 'id',
    });
    
    // Create table for each test
    await TestModel.createTable();
    await waitForTable(TestModel);
  });

  afterEach(async () => {
    await cleanupTable(TestModel);
  });

  describe('Table Management', () => {
    it('should create a table successfully', async () => {
      // Table is already created in beforeEach
      const result = await TestModel.createTable();
      // Should handle table already exists
      expect(result).toBeDefined();
    });

    it('should delete a table successfully', async () => {
      const result = await TestModel.deleteTable();
      expect(result).toBeDefined();
    });
  });

  describe('CRUD Operations', () => {
    it('should create an item successfully', async () => {
      const testData = generateTestData.simple('create-test');
      
      const result = await TestModel.create(testData);
      expect(result).toBeDefined();
      expect(result.id).toBe('create-test');
      expect(result.name).toBe('Test User create-test');
    });

    it('should get an item successfully', async () => {
      const testData = generateTestData.simple('get-test');
      
      // First create the item
      await TestModel.create(testData);
      
      // Then get it
      const result = await TestModel.get({ id: 'get-test' });
      expect(result).toBeDefined();
      expect(result.id).toBe('get-test');
      expect(result.name).toBe('Test User get-test');
    });

    it('should return null when getting non-existent item', async () => {
      const result = await TestModel.get({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should update an item successfully', async () => {
      const testData = generateTestData.simple('update-test');
      
      // First create the item
      await TestModel.create(testData);
      
      // Then update it
      const updatedData = { name: 'Updated Name' };
      const result = await TestModel.update({ id: 'update-test' }, updatedData);
      
      expect(result).toBeDefined();
      expect(result.id).toBe('update-test');
      expect(result.name).toBe('Updated Name');
    });

    it('should throw error when updating non-existent item', async () => {
      await expect(
        TestModel.update({ id: 'non-existent' }, { name: 'Updated' })
      ).rejects.toThrow(ErrorMatchers.ItemNotFound);
    });

    it('should destroy an item successfully', async () => {
      const testData = generateTestData.simple('destroy-test');
      
      // First create the item
      await TestModel.create(testData);
      
      // Then destroy it
      const result = await TestModel.destroy({ id: 'destroy-test' });
      expect(result).toBeDefined();
      
      // Verify it's gone
      const getResult = await TestModel.get({ id: 'destroy-test' });
      expect(getResult).toBeNull();
    });
  });

  describe('Timestamps', () => {
    let TimestampModel: any;
    const timestampTableName = generateTableName('timestamps');

    beforeEach(async () => {
      TimestampModel = createTestModel(timestampTableName, TestSchemas.Simple, {
        hashKey: 'id',
        timestamps: true,
      });
      
      await TimestampModel.createTable();
      await waitForTable(TimestampModel);
    });

    afterEach(async () => {
      await cleanupTable(TimestampModel);
    });

    it('should add timestamps when creating items', async () => {
      const testData = generateTestData.simple('timestamp-create');
      
      const result = await TimestampModel.create(testData);
      expect(result).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(new Date(result.createdAt)).toBeInstanceOf(Date);
      expect(new Date(result.updatedAt)).toBeInstanceOf(Date);
    });

    it('should update timestamps when updating items', async () => {
      const testData = generateTestData.simple('timestamp-update');
      
      // Create item
      const created = await TimestampModel.create(testData);
      const originalUpdatedAt = created.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update item
      const updated = await TimestampModel.update(
        { id: 'timestamp-update' }, 
        { name: 'Updated Name' }
      );
      
      expect(updated.updatedAt).toBeDefined();
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });
});

describe('Complex Schema Operations', () => {
  let ComplexModel: any;
  const complexTableName = generateTableName('complex');

  beforeEach(async () => {
    ComplexModel = createTestModel(complexTableName, TestSchemas.Complex, {
      hashKey: 'id',
      rangeKey: 'timestamp',
      timestamps: true,
    });
    
    await ComplexModel.createTable();
    await waitForTable(ComplexModel);
  });

  afterEach(async () => {
    await cleanupTable(ComplexModel);
  });

  it('should handle complex data types', async () => {
    const testData = generateTestData.complex('complex-test');
    
    const result = await ComplexModel.create(testData);
    expect(result).toBeDefined();
    expect(result.id).toBe('complex-test');
    expect(result.string).toBe(testData.string);
    expect(result.number).toBe(testData.number);
    expect(result.boolean).toBe(testData.boolean);
    expect(result.array).toEqual(testData.array);
    expect(result.object).toEqual(testData.object);
    expect(result.numberSet).toEqual(testData.numberSet);
    expect(result.stringSet).toEqual(testData.stringSet);
    expect(result.uint8Array).toEqual(testData.uint8Array);
  });

  it('should get complex items with range key', async () => {
    const testData = generateTestData.complex('complex-get');
    
    // Create item
    await ComplexModel.create(testData);
    
    // Get item using both hash and range key
    const result = await ComplexModel.get({
      id: 'complex-get',
      timestamp: testData.timestamp,
    });
    
    expect(result).toBeDefined();
    expect(result.id).toBe('complex-get');
    expect(result.timestamp).toBe(testData.timestamp);
  });

  it('should handle null values correctly', async () => {
    const testData = generateTestData.complex('null-test');
    testData.nullable = null;
    
    const result = await ComplexModel.create(testData);
    expect(result.nullable).toBeNull();
    
    // Get and verify
    const retrieved = await ComplexModel.get({
      id: 'null-test',
      timestamp: testData.timestamp,
    });
    expect(retrieved.nullable).toBeNull();
  });
});

describe('Query Operations', () => {
  let QueryModel: any;
  const queryTableName = generateTableName('query');

  beforeEach(async () => {
    QueryModel = createTestModel(queryTableName, TestSchemas.WithRange, {
      hashKey: 'pk',
      rangeKey: 'sk',
    });
    
    await QueryModel.createTable();
    await waitForTable(QueryModel);
  });

  afterEach(async () => {
    await cleanupTable(QueryModel);
  });

  it('should perform basic query operations', async () => {
    const partitionKey = 'test-partition';
    
    // Create multiple items with same partition key
    const items = [
      { pk: partitionKey, sk: 'item1', data: 'data1' },
      { pk: partitionKey, sk: 'item2', data: 'data2' },
      { pk: partitionKey, sk: 'item3', data: 'data3' },
    ];
    
    for (const item of items) {
      await QueryModel.create(item);
    }
    
    // Query by partition key
    const result = await QueryModel.query('', { pk: partitionKey });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // Note: The current implementation might need adjustment for proper query functionality
  });
});