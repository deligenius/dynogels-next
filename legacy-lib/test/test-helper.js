'use strict';

const sinon = require('sinon');
const AWS = require('aws-sdk');
const Table = require('../lib/table');
const _ = require('lodash');

exports.mockDynamoDB = () => {
  const opts = { endpoint: 'http://dynamodb-local:8000', apiVersion: '2012-08-10' };
  const db = new AWS.DynamoDB(opts);

  db.scan = sinon.stub();
  db.putItem = sinon.stub();
  db.deleteItem = sinon.stub();
  db.query = sinon.stub();
  db.getItem = sinon.stub();
  db.updateItem = sinon.stub();
  db.createTable = sinon.stub();
  db.describeTable = sinon.stub();
  db.updateTable = sinon.stub();
  db.deleteTable = sinon.stub();
  db.batchGetItem = sinon.stub();
  db.batchWriteItem = sinon.stub();

  return db;
};

exports.realDynamoDB = () => {
  const opts = { endpoint: 'http://localhost:8000', apiVersion: '2012-08-10', region: 'eu-west-1' };
  return new AWS.DynamoDB(opts);
};

exports.mockDocClient = () => {
  const client = new AWS.DynamoDB.DocumentClient({ service: exports.mockDynamoDB() });

  const operations = [
    'batchGet',
    'batchWrite',
    'put',
    'get',
    'delete',
    'update',
    'scan',
    'query'
  ];

  _.each(operations, (op) => {
    client[op] = sinon.stub();
  });

  client.service.scan = sinon.stub();
  client.service.putItem = sinon.stub();
  client.service.deleteItem = sinon.stub();
  client.service.query = sinon.stub();
  client.service.getItem = sinon.stub();
  client.service.updateItem = sinon.stub();
  client.service.createTable = sinon.stub();
  client.service.describeTable = sinon.stub();
  client.service.updateTable = sinon.stub();
  client.service.deleteTable = sinon.stub();
  client.service.batchGetItem = sinon.stub();
  client.service.batchWriteItem = sinon.stub();

  return client;
};

exports.mockSerializer = () => {
  const serializer = {
    buildKey: sinon.stub(),
    deserializeItem: sinon.stub(),
    serializeItem: sinon.stub(),
    serializeItemForUpdate: sinon.stub()
  };

  return serializer;
};

exports.mockTable = () => sinon.createStubInstance(Table);

exports.fakeUUID = () => {
  const uuid = {
    v1: sinon.stub(),
    v4: sinon.stub()
  };

  return uuid;
};

exports.randomName = prefix => `${prefix}_${Date.now()}.${_.random(1000)}`;

exports.testLogger = () => ({
  info: () => null,
  warn: () => null,
});

// Enhanced helpers for local DynamoDB testing
exports.localDynamoDB = () => {
  const opts = { 
    endpoint: 'http://localhost:8000', 
    apiVersion: '2012-08-10', 
    region: 'localhost',
    accessKeyId: 'test',
    secretAccessKey: 'test'
  };
  return new AWS.DynamoDB(opts);
};

exports.localDocClient = () => {
  return new AWS.DynamoDB.DocumentClient({ 
    service: exports.localDynamoDB() 
  });
};

// Data generation helpers
exports.generateTestData = {
  user: (index = 0) => ({
    email: `testuser${index}@example.com`,
    name: `Test User ${index}`,
    age: 25 + (index % 40),
    roles: index % 2 === 0 ? ['user'] : ['admin', 'user'],
    settings: {
      theme: index % 2 === 0 ? 'light' : 'dark',
      notifications: index % 3 !== 0,
      language: ['en', 'es', 'fr'][index % 3]
    },
    metadata: {
      source: 'test',
      index: index,
      timestamp: new Date().toISOString()
    },
    tags: [`tag${index % 5}`, `category${index % 3}`],
    score: Math.floor(Math.random() * 1000)
  }),

  blogPost: (authorId, index = 0) => ({
    authorId: authorId,
    title: `Blog Post ${index}`,
    content: `This is the content of blog post number ${index}. It contains various information and insights.`,
    published: index % 3 !== 0,
    category: ['technology', 'programming', 'design', 'business'][index % 4],
    tags: [`tag${index % 10}`, `post${index}`],
    views: Math.floor(Math.random() * 1000),
    likes: Math.floor(Math.random() * 100)
  }),

  product: (index = 0) => ({
    name: `Product ${index}`,
    description: `Description for product ${index}`,
    price: Math.round((Math.random() * 100 + 10) * 100) / 100,
    category: ['electronics', 'books', 'clothing', 'sports'][index % 4],
    tags: [`tag${index % 5}`, `product${index}`],
    inStock: index % 10 !== 0,
    stockCount: Math.floor(Math.random() * 100),
    ratings: Array.from({length: Math.floor(Math.random() * 10) + 1}, 
      () => Math.floor(Math.random() * 5) + 1),
    metadata: {
      brand: `Brand ${index % 10}`,
      model: `Model ${index}`,
      year: 2020 + (index % 4)
    }
  })
};

// Table management helpers
exports.waitForTableActive = (model, maxWaitMs = 30000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkTable = () => {
      model.describeTable((err, data) => {
        if (err) {
          if (Date.now() - startTime > maxWaitMs) {
            return reject(new Error(`Table did not become active within ${maxWaitMs}ms`));
          }
          setTimeout(checkTable, 1000);
        } else if (data.Table.TableStatus === 'ACTIVE') {
          resolve(data);
        } else {
          if (Date.now() - startTime > maxWaitMs) {
            return reject(new Error(`Table did not become active within ${maxWaitMs}ms`));
          }
          setTimeout(checkTable, 1000);
        }
      });
    };
    
    checkTable();
  });
};

exports.cleanupTable = (model) => {
  return new Promise((resolve) => {
    model.deleteTable((err) => {
      // Always resolve, even if there's an error (table might not exist)
      setTimeout(resolve, 2000); // Wait a bit for deletion to complete
    });
  });
};

// Async wrapper for callback-based operations
exports.promisify = {
  create: (model, data) => {
    return new Promise((resolve, reject) => {
      model.create(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  get: (model, key, options = {}) => {
    return new Promise((resolve, reject) => {
      model.get(key, options, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  update: (model, data, options = {}) => {
    return new Promise((resolve, reject) => {
      model.update(data, options, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  destroy: (model, key, options = {}) => {
    return new Promise((resolve, reject) => {
      model.destroy(key, options, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  query: (queryBuilder) => {
    return new Promise((resolve, reject) => {
      queryBuilder.exec((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  scan: (scanBuilder) => {
    return new Promise((resolve, reject) => {
      scanBuilder.exec((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  getItems: (model, keys, options = {}) => {
    return new Promise((resolve, reject) => {
      model.getItems(keys, options, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  createTable: (model, options = {}) => {
    return new Promise((resolve, reject) => {
      model.createTable(options, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },

  deleteTable: (model) => {
    return new Promise((resolve, reject) => {
      model.deleteTable((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
};

// Performance measurement helpers
exports.measurePerformance = (operation, label) => {
  return async function(...args) {
    const startTime = Date.now();
    const result = await operation(...args);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`[PERF] ${label}: ${duration}ms`);
    
    return {
      result,
      duration,
      timestamp: startTime
    };
  };
};

// Batch operation helpers
exports.createInBatches = async (model, items, batchSize = 25) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => exports.promisify.create(model, item))
    );
    results.push(...batchResults);
  }
  
  return results;
};

// Validation helpers
exports.validateModel = (model, expectedProperties) => {
  expectedProperties.forEach(prop => {
    if (!model.get(prop)) {
      throw new Error(`Expected property '${prop}' is missing or falsy`);
    }
  });
  return true;
};

exports.expectValidTimestamps = (model) => {
  const createdAt = model.get('createdAt');
  const updatedAt = model.get('updatedAt');
  
  if (createdAt) {
    if (!(createdAt instanceof Date)) {
      throw new Error('createdAt should be a Date object');
    }
  }
  
  if (updatedAt) {
    if (!(updatedAt instanceof Date)) {
      throw new Error('updatedAt should be a Date object');
    }
  }
  
  if (createdAt && updatedAt && updatedAt < createdAt) {
    throw new Error('updatedAt should not be before createdAt');
  }
  
  return true;
};

// Error helpers
exports.expectValidationError = (error) => {
  if (!error) {
    throw new Error('Expected a validation error but none was thrown');
  }
  if (error.name !== 'ValidationError') {
    throw new Error(`Expected ValidationError but got ${error.name}: ${error.message}`);
  }
  return true;
};

exports.expectConditionalCheckError = (error) => {
  if (!error) {
    throw new Error('Expected a conditional check error but none was thrown');
  }
  if (error.code !== 'ConditionalCheckFailedException') {
    throw new Error(`Expected ConditionalCheckFailedException but got ${error.code}: ${error.message}`);
  }
  return true;
};
