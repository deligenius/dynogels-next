'use strict';

const dynogels = require('../index');
const chai = require('chai');
const async = require('async');
const _ = require('lodash');
const Joi = require('joi');

const expect = chai.expect;
chai.should();

// Configure for local DynamoDB
dynogels.AWS.config.update({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  region: 'localhost',
  endpoint: 'http://localhost:8000'
});

describe('Performance Tests', function() {
  this.timeout(120000); // 2 minutes for performance tests

  let User, Product, Order, Log;
  const performanceMetrics = {};

  before(function() {
    // Define models optimized for performance testing
    
    User = dynogels.define('PerfTestUser', {
      hashKey: 'userId',
      timestamps: true,
      schema: {
        userId: dynogels.types.uuid(),
        email: Joi.string().email().required(),
        name: Joi.string().required(),
        age: Joi.number(),
        location: {
          country: Joi.string(),
          city: Joi.string(),
          zipCode: Joi.string()
        },
        preferences: Joi.object(),
        tags: dynogels.types.stringSet(),
        score: Joi.number().default(0),
        isActive: Joi.boolean().default(true)
      }
    });

    Product = dynogels.define('PerfTestProduct', {
      hashKey: 'productId',
      timestamps: true,
      schema: {
        productId: dynogels.types.uuid(),
        name: Joi.string().required(),
        category: Joi.string().required(),
        price: Joi.number().required(),
        description: Joi.string(),
        tags: dynogels.types.stringSet(),
        inStock: Joi.boolean().default(true),
        stockCount: Joi.number().default(0),
        ratings: Joi.array().items(Joi.number()),
        metadata: Joi.object()
      },
      indexes: [{
        hashKey: 'category',
        rangeKey: 'price',
        name: 'CategoryPriceIndex',
        type: 'global'
      }]
    });

    Order = dynogels.define('PerfTestOrder', {
      hashKey: 'customerId',
      rangeKey: 'orderId',
      timestamps: true,
      schema: {
        customerId: Joi.string().required(),
        orderId: dynogels.types.uuid(),
        status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered').default('pending'),
        total: Joi.number().required(),
        items: Joi.array().items(Joi.object({
          productId: Joi.string().required(),
          quantity: Joi.number().required(),
          price: Joi.number().required()
        })),
        shippingAddress: Joi.object(),
        paymentMethod: Joi.string()
      },
      indexes: [{
        hashKey: 'status',
        rangeKey: 'createdAt',
        name: 'StatusIndex',
        type: 'global'
      }]
    });

    Log = dynogels.define('PerfTestLog', {
      hashKey: 'date',
      rangeKey: 'timestamp',
      timestamps: false,
      schema: {
        date: Joi.string().required(), // YYYY-MM-DD format
        timestamp: Joi.string().required(), // ISO timestamp
        level: Joi.string().valid('info', 'warn', 'error').required(),
        message: Joi.string().required(),
        userId: Joi.string(),
        action: Joi.string(),
        metadata: Joi.object()
      }
    });
  });

  describe('Setup Performance Test Environment', function() {
    it('should create performance test tables', function(done) {
      const tableOptions = {
        'PerfTestUser': { readCapacity: 5, writeCapacity: 5 },
        'PerfTestProduct': { readCapacity: 5, writeCapacity: 5 },
        'PerfTestOrder': { readCapacity: 5, writeCapacity: 5 },
        'PerfTestLog': { readCapacity: 5, writeCapacity: 5 }
      };

      dynogels.createTables(tableOptions, function(err) {
        expect(err).to.not.exist;
        done();
      });
    });
  });

  describe('Bulk Data Creation Performance', function() {
    it('should measure performance of creating 1000 users sequentially', function(done) {
      const userCount = 1000;
      const users = [];
      
      for (let i = 0; i < userCount; i++) {
        users.push({
          email: `user${i}@performance.test`,
          name: `Performance User ${i}`,
          age: 20 + (i % 50),
          location: {
            country: ['US', 'CA', 'UK', 'DE', 'FR'][i % 5],
            city: `City${i % 100}`,
            zipCode: `${10000 + (i % 90000)}`
          },
          preferences: {
            theme: ['light', 'dark'][i % 2],
            language: ['en', 'es', 'fr'][i % 3],
            notifications: i % 2 === 0
          },
          tags: [`tag${i % 10}`, `category${i % 5}`],
          score: Math.floor(Math.random() * 1000)
        });
      }

      const startTime = Date.now();
      
      async.mapSeries(users, User.create.bind(User), function(err, createdUsers) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = userCount / (duration / 1000);
        
        performanceMetrics.sequentialUserCreation = {
          count: userCount,
          duration: duration,
          throughput: throughput,
          avgTimePerItem: duration / userCount
        };

        console.log(`\n=== Sequential User Creation Performance ===`);
        console.log(`Created ${userCount} users in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} users/second`);
        console.log(`Average time per user: ${(duration / userCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(createdUsers).to.have.length(userCount);
        expect(throughput).to.be.above(1); // At least 1 user per second
        
        done();
      });
    });

    it('should measure performance of creating 500 users in parallel (limited concurrency)', function(done) {
      const userCount = 500;
      const concurrencyLimit = 10;
      const users = [];
      
      for (let i = 1000; i < 1000 + userCount; i++) {
        users.push({
          email: `paralleluser${i}@performance.test`,
          name: `Parallel User ${i}`,
          age: 20 + (i % 50),
          location: {
            country: ['US', 'CA', 'UK', 'DE', 'FR'][i % 5],
            city: `City${i % 100}`,
            zipCode: `${10000 + (i % 90000)}`
          },
          tags: [`tag${i % 10}`, `category${i % 5}`],
          score: Math.floor(Math.random() * 1000)
        });
      }

      const startTime = Date.now();
      
      async.mapLimit(users, concurrencyLimit, User.create.bind(User), function(err, createdUsers) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = userCount / (duration / 1000);
        
        performanceMetrics.parallelUserCreation = {
          count: userCount,
          concurrency: concurrencyLimit,
          duration: duration,
          throughput: throughput,
          avgTimePerItem: duration / userCount
        };

        console.log(`\n=== Parallel User Creation Performance ===`);
        console.log(`Created ${userCount} users with concurrency ${concurrencyLimit} in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} users/second`);
        console.log(`Average time per user: ${(duration / userCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(createdUsers).to.have.length(userCount);
        expect(throughput).to.be.above(performanceMetrics.sequentialUserCreation.throughput);
        
        done();
      });
    });

    it('should measure performance of creating products with complex data', function(done) {
      const productCount = 500;
      const products = [];
      
      const categories = ['Electronics', 'Books', 'Clothing', 'Sports', 'Home'];
      const productNames = [
        'Laptop', 'Smartphone', 'Tablet', 'Headphones', 'Camera',
        'Novel', 'Textbook', 'Magazine', 'Comic', 'Manual',
        'Shirt', 'Pants', 'Shoes', 'Hat', 'Jacket',
        'Ball', 'Racket', 'Weights', 'Mat', 'Bike',
        'Chair', 'Table', 'Lamp', 'Pillow', 'Rug'
      ];
      
      for (let i = 0; i < productCount; i++) {
        const category = categories[i % categories.length];
        const baseName = productNames[i % productNames.length];
        
        products.push({
          name: `${baseName} Model ${i}`,
          category: category,
          price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
          description: `High quality ${baseName.toLowerCase()} with advanced features. Product #${i}`,
          tags: [`${category.toLowerCase()}`, `${baseName.toLowerCase()}`, `model-${i % 10}`],
          inStock: Math.random() > 0.1,
          stockCount: Math.floor(Math.random() * 100),
          ratings: Array.from({ length: Math.floor(Math.random() * 20) + 1 }, 
            () => Math.floor(Math.random() * 5) + 1),
          metadata: {
            brand: `Brand${i % 20}`,
            model: `Model${i}`,
            features: [`feature${i % 5}`, `feature${(i + 1) % 5}`],
            weight: Math.round(Math.random() * 10 * 100) / 100,
            dimensions: {
              length: Math.round(Math.random() * 50),
              width: Math.round(Math.random() * 50),
              height: Math.round(Math.random() * 50)
            }
          }
        });
      }

      const startTime = Date.now();
      
      async.mapLimit(products, 8, Product.create.bind(Product), function(err, createdProducts) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = productCount / (duration / 1000);
        
        performanceMetrics.productCreation = {
          count: productCount,
          duration: duration,
          throughput: throughput,
          avgTimePerItem: duration / productCount
        };

        console.log(`\n=== Product Creation Performance ===`);
        console.log(`Created ${productCount} products in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} products/second`);
        console.log(`Average time per product: ${(duration / productCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(createdProducts).to.have.length(productCount);
        
        done();
      });
    });
  });

  describe('Query Performance Tests', function() {
    let testUserIds = [];

    before(function(done) {
      // Get some user IDs for testing
      User.scan()
        .limit(100)
        .attributes(['userId'])
        .exec(function(err, result) {
          expect(err).to.not.exist;
          testUserIds = result.Items.map(item => item.get('userId'));
          done();
        });
    });

    it('should measure performance of batch get operations', function(done) {
      const batchSizes = [10, 25, 50, 100];
      
      async.mapSeries(batchSizes, function(batchSize, callback) {
        const userIdsSubset = testUserIds.slice(0, batchSize);
        const startTime = Date.now();
        
        User.getItems(userIdsSubset, function(err, users) {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          expect(err).to.not.exist;
          expect(users.length).to.be.at.most(batchSize);
          
          const result = {
            batchSize: batchSize,
            actualCount: users.length,
            duration: duration,
            avgTimePerItem: duration / users.length
          };
          
          console.log(`Batch get ${batchSize} users: ${duration}ms (${result.avgTimePerItem.toFixed(2)}ms per item)`);
          
          callback(null, result);
        });
      }, function(err, results) {
        expect(err).to.not.exist;
        performanceMetrics.batchGetPerformance = results;
        done();
      });
    });

    it('should measure scan performance with different page sizes', function(done) {
      const pageSizes = [10, 50, 100];
      
      async.mapSeries(pageSizes, function(pageSize, callback) {
        const startTime = Date.now();
        
        User.scan()
          .limit(pageSize)
          .exec(function(err, result) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(err).to.not.exist;
            
            const perfResult = {
              pageSize: pageSize,
              actualCount: result.Items.length,
              duration: duration,
              scannedCount: result.ScannedCount,
              avgTimePerItem: duration / result.Items.length
            };
            
            console.log(`Scan ${pageSize} users: ${duration}ms (${perfResult.avgTimePerItem.toFixed(2)}ms per item)`);
            
            callback(null, perfResult);
          });
      }, function(err, results) {
        expect(err).to.not.exist;
        performanceMetrics.scanPerformance = results;
        done();
      });
    });

    it('should measure query performance on GSI', function(done) {
      const categories = ['Electronics', 'Books', 'Clothing'];
      
      async.mapSeries(categories, function(category, callback) {
        const startTime = Date.now();
        
        Product.query(category)
          .usingIndex('CategoryPriceIndex')
          .limit(50)
          .exec(function(err, result) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(err).to.not.exist;
            
            const perfResult = {
              category: category,
              count: result.Items.length,
              duration: duration,
              avgTimePerItem: result.Items.length > 0 ? duration / result.Items.length : 0
            };
            
            console.log(`Query ${category} products: ${duration}ms (${result.Items.length} items)`);
            
            callback(null, perfResult);
          });
      }, function(err, results) {
        expect(err).to.not.exist;
        performanceMetrics.gsiQueryPerformance = results;
        done();
      });
    });

    it('should measure parallel scan performance', function(done) {
      const segmentCounts = [2, 4, 8];
      
      async.mapSeries(segmentCounts, function(segments, callback) {
        const startTime = Date.now();
        
        User.parallelScan(segments)
          .exec(function(err, result) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(err).to.not.exist;
            
            const perfResult = {
              segments: segments,
              count: result.Items.length,
              duration: duration,
              avgTimePerItem: result.Items.length > 0 ? duration / result.Items.length : 0
            };
            
            console.log(`Parallel scan with ${segments} segments: ${duration}ms (${result.Items.length} items)`);
            
            callback(null, perfResult);
          });
      }, function(err, results) {
        expect(err).to.not.exist;
        performanceMetrics.parallelScanPerformance = results;
        done();
      });
    });
  });

  describe('Update Performance Tests', function() {
    let testUsers = [];

    before(function(done) {
      User.scan()
        .limit(200)
        .exec(function(err, result) {
          expect(err).to.not.exist;
          testUsers = result.Items;
          done();
        });
    });

    it('should measure performance of individual updates', function(done) {
      const updateCount = 100;
      const usersToUpdate = testUsers.slice(0, updateCount);
      
      const startTime = Date.now();
      
      async.mapSeries(usersToUpdate, function(user, callback) {
        User.update({
          userId: user.get('userId'),
          score: { $add: Math.floor(Math.random() * 10) },
          isActive: Math.random() > 0.5
        }, callback);
      }, function(err, results) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = updateCount / (duration / 1000);
        
        performanceMetrics.sequentialUpdates = {
          count: updateCount,
          duration: duration,
          throughput: throughput,
          avgTimePerUpdate: duration / updateCount
        };

        console.log(`\n=== Sequential Update Performance ===`);
        console.log(`Updated ${updateCount} users in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} updates/second`);
        console.log(`Average time per update: ${(duration / updateCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(results).to.have.length(updateCount);
        
        done();
      });
    });

    it('should measure performance of parallel updates', function(done) {
      const updateCount = 100;
      const concurrency = 10;
      const usersToUpdate = testUsers.slice(100, 100 + updateCount);
      
      const startTime = Date.now();
      
      async.mapLimit(usersToUpdate, concurrency, function(user, callback) {
        User.update({
          userId: user.get('userId'),
          score: { $add: Math.floor(Math.random() * 10) },
          age: 20 + Math.floor(Math.random() * 50)
        }, callback);
      }, function(err, results) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = updateCount / (duration / 1000);
        
        performanceMetrics.parallelUpdates = {
          count: updateCount,
          concurrency: concurrency,
          duration: duration,
          throughput: throughput,
          avgTimePerUpdate: duration / updateCount
        };

        console.log(`\n=== Parallel Update Performance ===`);
        console.log(`Updated ${updateCount} users with concurrency ${concurrency} in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} updates/second`);
        console.log(`Average time per update: ${(duration / updateCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(results).to.have.length(updateCount);
        expect(throughput).to.be.above(performanceMetrics.sequentialUpdates.throughput);
        
        done();
      });
    });
  });

  describe('Complex Workflow Performance', function() {
    it('should measure performance of creating orders with related data', function(done) {
      const orderCount = 200;
      const customerIds = testUsers.slice(0, 50).map(u => u.get('userId'));
      
      // Get some products for orders
      Product.scan()
        .limit(100)
        .exec(function(err, productResult) {
          expect(err).to.not.exist;
          const products = productResult.Items;
          
          const orders = [];
          for (let i = 0; i < orderCount; i++) {
            const customerId = customerIds[i % customerIds.length];
            const itemCount = Math.floor(Math.random() * 5) + 1;
            const orderItems = [];
            let total = 0;
            
            for (let j = 0; j < itemCount; j++) {
              const product = products[Math.floor(Math.random() * products.length)];
              const quantity = Math.floor(Math.random() * 3) + 1;
              const price = product.get('price');
              
              orderItems.push({
                productId: product.get('productId'),
                quantity: quantity,
                price: price
              });
              
              total += quantity * price;
            }
            
            orders.push({
              customerId: customerId,
              status: ['pending', 'processing', 'shipped'][Math.floor(Math.random() * 3)],
              total: Math.round(total * 100) / 100,
              items: orderItems,
              shippingAddress: {
                street: `${Math.floor(Math.random() * 9999)} Test St`,
                city: 'Test City',
                state: 'TS',
                zipCode: `${10000 + Math.floor(Math.random() * 90000)}`
              },
              paymentMethod: ['credit', 'debit', 'paypal'][Math.floor(Math.random() * 3)]
            });
          }
          
          const startTime = Date.now();
          
          async.mapLimit(orders, 8, Order.create.bind(Order), function(err, createdOrders) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            const throughput = orderCount / (duration / 1000);
            
            performanceMetrics.orderCreation = {
              count: orderCount,
              duration: duration,
              throughput: throughput,
              avgTimePerOrder: duration / orderCount
            };

            console.log(`\n=== Order Creation Performance ===`);
            console.log(`Created ${orderCount} orders in ${duration}ms`);
            console.log(`Throughput: ${throughput.toFixed(2)} orders/second`);
            console.log(`Average time per order: ${(duration / orderCount).toFixed(2)}ms`);

            expect(err).to.not.exist;
            expect(createdOrders).to.have.length(orderCount);
            
            done();
          });
        });
    });

    it('should measure performance of logging operations', function(done) {
      const logCount = 1000;
      const logLevels = ['info', 'warn', 'error'];
      const actions = ['login', 'logout', 'view_page', 'create_order', 'update_profile'];
      const userIds = testUsers.slice(0, 20).map(u => u.get('userId'));
      
      const logs = [];
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      for (let i = 0; i < logCount; i++) {
        const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        
        logs.push({
          date: today,
          timestamp: timestamp.toISOString(),
          level: logLevels[Math.floor(Math.random() * logLevels.length)],
          message: `User performed ${actions[Math.floor(Math.random() * actions.length)]} action`,
          userId: userIds[Math.floor(Math.random() * userIds.length)],
          action: actions[Math.floor(Math.random() * actions.length)],
          metadata: {
            ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
            userAgent: 'Test Agent',
            sessionId: `session_${i % 100}`
          }
        });
      }
      
      const startTime = Date.now();
      
      async.mapLimit(logs, 15, Log.create.bind(Log), function(err, createdLogs) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = logCount / (duration / 1000);
        
        performanceMetrics.logCreation = {
          count: logCount,
          duration: duration,
          throughput: throughput,
          avgTimePerLog: duration / logCount
        };

        console.log(`\n=== Log Creation Performance ===`);
        console.log(`Created ${logCount} logs in ${duration}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} logs/second`);
        console.log(`Average time per log: ${(duration / logCount).toFixed(2)}ms`);

        expect(err).to.not.exist;
        expect(createdLogs).to.have.length(logCount);
        
        done();
      });
    });
  });

  describe('Performance Summary', function() {
    it('should display comprehensive performance summary', function() {
      console.log('\n\n=== PERFORMANCE TEST SUMMARY ===\n');
      
      console.log('Create Operations:');
      console.log(`  Sequential Users: ${performanceMetrics.sequentialUserCreation.throughput.toFixed(2)} ops/sec`);
      console.log(`  Parallel Users: ${performanceMetrics.parallelUserCreation.throughput.toFixed(2)} ops/sec`);
      console.log(`  Products: ${performanceMetrics.productCreation.throughput.toFixed(2)} ops/sec`);
      console.log(`  Orders: ${performanceMetrics.orderCreation.throughput.toFixed(2)} ops/sec`);
      console.log(`  Logs: ${performanceMetrics.logCreation.throughput.toFixed(2)} ops/sec`);
      
      console.log('\nRead Operations:');
      performanceMetrics.batchGetPerformance.forEach(result => {
        console.log(`  Batch Get (${result.batchSize}): ${result.avgTimePerItem.toFixed(2)}ms per item`);
      });
      
      performanceMetrics.scanPerformance.forEach(result => {
        console.log(`  Scan (limit ${result.pageSize}): ${result.avgTimePerItem.toFixed(2)}ms per item`);
      });
      
      console.log('\nUpdate Operations:');
      console.log(`  Sequential Updates: ${performanceMetrics.sequentialUpdates.throughput.toFixed(2)} ops/sec`);
      console.log(`  Parallel Updates: ${performanceMetrics.parallelUpdates.throughput.toFixed(2)} ops/sec`);
      
      console.log('\nRecommendations:');
      console.log('  - Parallel operations significantly outperform sequential ones');
      console.log('  - Batch operations are more efficient for multiple items');
      console.log('  - Consider using parallel scans for large dataset operations');
      console.log('  - Monitor and adjust concurrency limits based on DynamoDB capacity');
      
      // Basic performance assertions
      expect(performanceMetrics.parallelUserCreation.throughput).to.be.above(
        performanceMetrics.sequentialUserCreation.throughput
      );
      expect(performanceMetrics.parallelUpdates.throughput).to.be.above(
        performanceMetrics.sequentialUpdates.throughput
      );
    });
  });

  describe('Cleanup Performance Tests', function() {
    it('should clean up performance test tables', function(done) {
      async.parallel([
        cb => User.deleteTable(cb),
        cb => Product.deleteTable(cb),
        cb => Order.deleteTable(cb),
        cb => Log.deleteTable(cb)
      ], function(err) {
        // Don't fail if cleanup fails
        console.log('\nPerformance test cleanup completed');
        done();
      });
    });
  });
});