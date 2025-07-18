/**
 * Model.query Demo Application
 * This file demonstrates the query system with fluent API and type-safe conditions
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory, TableManager } from './index.js';

// Define schemas for demonstration
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number(),
  status: z.enum(['active', 'inactive', 'pending']),
  department: z.string(),
  score: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const postSchema = z.object({
  userId: z.string(),
  postId: z.string(),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  publishedAt: z.string(),
  views: z.number(),
  featured: z.boolean(),
});

const orderSchema = z.object({
  customerId: z.string(),
  orderId: z.string(),
  orderDate: z.string(),
  amount: z.number(),
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered']),
  priority: z.enum(['low', 'medium', 'high']),
});

async function main() {
  console.log('🚀 Starting Model.query Demo\n');

  // 1. Initialize AWS clients and factory
  console.log('1. Initializing AWS clients...');
  const dynamoClient = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: 'http://localhost:8000', // For DynamoDB Local
  });

  const factory = new ModelFactory(dynamoClient);
  const tableManager = new TableManager(dynamoClient);

  // 2. Define models
  console.log('2. Defining models...');

  const User = factory.defineModel({
    hashKey: 'id',
    schema: userSchema,
    tableName: 'query-demo-users',
    timestamps: { createdAt: true, updatedAt: true },
  });

  const Post = factory.defineModel({
    hashKey: 'userId',
    rangeKey: 'postId',
    schema: postSchema,
    tableName: 'query-demo-posts',
  });

  const Order = factory.defineModel({
    hashKey: 'customerId',
    rangeKey: 'orderId',
    schema: orderSchema,
    tableName: 'query-demo-orders',
  });

  try {
    // 3. Create tables
    console.log('3. Creating tables...');

    if (!(await tableManager.tableExists('query-demo-users'))) {
      await tableManager.createTable(User, { read: 5, write: 5 });
      console.log('✅ Users table created');
    }

    if (!(await tableManager.tableExists('query-demo-posts'))) {
      await tableManager.createTable(Post, { read: 5, write: 5 });
      console.log('✅ Posts table created');
    }

    if (!(await tableManager.tableExists('query-demo-orders'))) {
      await tableManager.createTable(Order, { read: 5, write: 5 });
      console.log('✅ Orders table created');
    }

    // 4. Create sample data
    console.log('\n4. Creating sample data...');

    // Create users
    const users = [
      { id: 'user1', email: 'alice@company.com', name: 'Alice Johnson', age: 28, status: 'active' as const, department: 'engineering', score: 95 },
      { id: 'user2', email: 'bob@company.com', name: 'Bob Smith', age: 32, status: 'active' as const, department: 'marketing', score: 87 },
      { id: 'user3', email: 'charlie@company.com', name: 'Charlie Brown', age: 24, status: 'pending' as const, department: 'engineering', score: 72 },
      { id: 'user4', email: 'diana@company.com', name: 'Diana Prince', age: 35, status: 'inactive' as const, department: 'sales', score: 98 },
      { id: 'user5', email: 'eve@company.com', name: 'Eve Wilson', age: 29, status: 'active' as const, department: 'engineering', score: 91 },
    ];

    for (const userData of users) {
      await User.create(userData);
    }

    // Create posts
    const posts = [
      { userId: 'user1', postId: 'post1', title: 'TypeScript Best Practices', content: 'Learn TypeScript...', category: 'tech', publishedAt: '2024-01-15', views: 150, featured: true },
      { userId: 'user1', postId: 'post2', title: 'Advanced DynamoDB', content: 'Deep dive...', category: 'tech', publishedAt: '2024-02-01', views: 89, featured: false },
      { userId: 'user1', postId: 'post3', title: 'AWS Best Practices', content: 'Cloud patterns...', category: 'tech', publishedAt: '2024-02-15', views: 203, featured: true },
      { userId: 'user2', postId: 'post4', title: 'Marketing Strategies', content: 'Growth hacking...', category: 'business', publishedAt: '2024-01-20', views: 145, featured: false },
      { userId: 'user2', postId: 'post5', title: 'Brand Building', content: 'Creating brands...', category: 'business', publishedAt: '2024-02-10', views: 67, featured: true },
      { userId: 'user3', postId: 'post6', title: 'Internship Journey', content: 'Learning experience...', category: 'personal', publishedAt: '2024-01-25', views: 45, featured: false },
    ];

    for (const postData of posts) {
      await Post.create(postData);
    }

    // Create orders
    const orders = [
      { customerId: 'user1', orderId: 'order1', orderDate: '2024-01-10', amount: 299.99, status: 'delivered' as const, priority: 'high' as const },
      { customerId: 'user1', orderId: 'order2', orderDate: '2024-02-05', amount: 149.99, status: 'shipped' as const, priority: 'medium' as const },
      { customerId: 'user1', orderId: 'order3', orderDate: '2024-02-20', amount: 79.99, status: 'pending' as const, priority: 'low' as const },
      { customerId: 'user2', orderId: 'order4', orderDate: '2024-01-15', amount: 199.99, status: 'delivered' as const, priority: 'medium' as const },
      { customerId: 'user2', orderId: 'order5', orderDate: '2024-02-12', amount: 349.99, status: 'confirmed' as const, priority: 'high' as const },
      { customerId: 'user3', orderId: 'order6', orderDate: '2024-02-01', amount: 59.99, status: 'delivered' as const, priority: 'low' as const },
    ];

    for (const orderData of orders) {
      await Order.create(orderData);
    }

    console.log('✅ Sample data created');

    // 5. Demonstrate query operations
    console.log('\n5. Model.query Operations Demo:');

    // Simple query - all posts by user1
    console.log('\n📝 Simple query - All posts by user1:');
    const user1Posts = await Post.query('user1').exec();
    console.log(`Found ${user1Posts.length} posts by user1:`, user1Posts.map(p => ({ postId: p.postId, title: p.title })));

    // Query with range key condition
    console.log('\n📝 Query with range key condition - Posts after post2:');
    const recentPosts = await Post.query('user1').where('postId').greaterThan('post2').exec();
    console.log(`Found ${recentPosts.length} posts:`, recentPosts.map(p => ({ postId: p.postId, title: p.title })));

    // Query with filter conditions
    console.log('\n📝 Query with filter - Featured posts by user1:');
    const featuredPosts = await Post.query('user1').filter('featured').equals(true).exec();
    console.log(`Found ${featuredPosts.length} featured posts:`, featuredPosts.map(p => ({ postId: p.postId, title: p.title, featured: p.featured })));

    // Query with multiple filters
    console.log('\n📝 Query with multiple filters - Tech posts with > 100 views:');
    const popularTechPosts = await Post.query('user1')
      .filter('category').equals('tech')
      .filter('views').greaterThan(100)
      .exec();
    console.log(`Found ${popularTechPosts.length} popular tech posts:`, popularTechPosts.map(p => ({ postId: p.postId, title: p.title, views: p.views })));

    // Query with string operations
    console.log('\n📝 Query with string operations - Posts with "AWS" in title:');
    const awsPosts = await Post.query('user1')
      .filter('title').contains('AWS')
      .exec();
    console.log(`Found ${awsPosts.length} AWS posts:`, awsPosts.map(p => ({ postId: p.postId, title: p.title })));

    // Query with range conditions
    console.log('\n📝 Query with range conditions - Posts with 50-200 views:');
    const moderateViewPosts = await Post.query('user1')
      .filter('views').between(50, 200)
      .exec();
    console.log(`Found ${moderateViewPosts.length} posts with moderate views:`, moderateViewPosts.map(p => ({ postId: p.postId, views: p.views })));

    // Query with limit and ordering
    console.log('\n📝 Query with limit and ordering - Latest 2 posts by user1:');
    const latestPosts = await Post.query('user1')
      .descending()
      .limit(2)
      .exec();
    console.log(`Found ${latestPosts.length} latest posts:`, latestPosts.map(p => ({ postId: p.postId, title: p.title })));

    // Order queries demonstration
    console.log('\n📝 Order queries - All orders for user1:');
    const user1Orders = await Order.query('user1').exec();
    console.log(`Found ${user1Orders.length} orders:`, user1Orders.map(o => ({ orderId: o.orderId, amount: o.amount, status: o.status })));

    // Order queries with date range
    console.log('\n📝 Order queries with date range - Orders after 2024-02-01:');
    const recentOrders = await Order.query('user1')
      .where('orderId').greaterThan('order1')
      .exec();
    console.log(`Found ${recentOrders.length} recent orders:`, recentOrders.map(o => ({ orderId: o.orderId, orderDate: o.orderDate })));

    // Order queries with filters
    console.log('\n📝 Order queries with filters - High priority orders > $200:');
    const highValueOrders = await Order.query('user1')
      .filter('priority').equals('high')
      .filter('amount').greaterThan(200)
      .exec();
    console.log(`Found ${highValueOrders.length} high-value orders:`, highValueOrders.map(o => ({ orderId: o.orderId, amount: o.amount, priority: o.priority })));

    // Demonstrate pagination
    console.log('\n📝 Pagination demo - Posts with page size 2:');
    let page = 1;
    let lastEvaluatedKey: any = undefined;
    
    do {
      const result = await Post.query('user1')
        .limit(2)
        .startKey(lastEvaluatedKey)
        .execWithPagination();
      
      console.log(`Page ${page}: Found ${result.items.length} posts:`, result.items.map(p => p.postId));
      lastEvaluatedKey = result.lastEvaluatedKey;
      page++;
    } while (lastEvaluatedKey && page <= 3); // Limit to 3 pages for demo

    // Demonstrate streaming
    console.log('\n📝 Streaming demo - All posts by user1 via stream:');
    const streamedPosts: string[] = [];
    for await (const post of Post.query('user1').stream()) {
      streamedPosts.push(post.postId);
    }
    console.log(`Streamed ${streamedPosts.length} posts:`, streamedPosts);

    // Demonstrate loadAll
    console.log('\n📝 LoadAll demo - All posts by user2:');
    const allUser2Posts = await Post.query('user2').loadAll().exec();
    console.log(`Loaded ${allUser2Posts.length} posts:`, allUser2Posts.map(p => ({ postId: p.postId, title: p.title })));

    // Complex query combinations
    console.log('\n📝 Complex query - Business posts by user2, featured, > 60 views, ascending order:');
    const complexQuery = await Post.query('user2')
      .filter('category').equals('business')
      .filter('featured').equals(true)
      .filter('views').greaterThan(60)
      .ascending()
      .exec();
    console.log(`Found ${complexQuery.length} posts matching complex criteria:`, complexQuery.map(p => ({ 
      postId: p.postId, 
      title: p.title, 
      category: p.category, 
      featured: p.featured, 
      views: p.views 
    })));

    // Error handling demonstration
    console.log('\n6. Error Handling Demo:');

    console.log('\n❌ Invalid query - Non-existent user:');
    const noUserPosts = await Post.query('user999').exec();
    console.log(`Posts for non-existent user: ${noUserPosts.length}`);

    console.log('\n❌ Invalid filter - No posts match strict criteria:');
    const strictPosts = await Post.query('user1')
      .filter('views').greaterThan(1000)
      .filter('featured').equals(true)
      .exec();
    console.log(`Posts with > 1000 views and featured: ${strictPosts.length}`);

    console.log('\n✅ Query demo completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Demonstrated simple hash key queries');
    console.log('- Showed range key conditions (where)');
    console.log('- Used filter conditions with various operators');
    console.log('- Combined multiple filters');
    console.log('- Demonstrated string operations (contains)');
    console.log('- Showed numeric range operations (between)');
    console.log('- Used ordering (ascending/descending)');
    console.log('- Demonstrated pagination and streaming');
    console.log('- Showed complex query combinations');
    console.log('- Tested error handling scenarios');

  } catch (error) {
    console.error('❌ Demo failed:', error);

    // Clean up tables on error
    try {
      console.log('\n🧹 Cleaning up tables...');
      await tableManager.deleteTable('query-demo-users').catch(() => {});
      await tableManager.deleteTable('query-demo-posts').catch(() => {});
      await tableManager.deleteTable('query-demo-orders').catch(() => {});
      console.log('✅ Tables cleaned up');
    } catch (cleanupError) {
      console.error('Failed to clean up tables:', cleanupError);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  process.exit(0);
});

// Run the demo
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

export { main as runQueryDemo };