/**
 * Simple Model Demo Application
 * This file demonstrates basic CRUD operations with a single table
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory, TableManager } from './index.js';

// Define schema for demonstration
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number(),
  status: z.enum(['active', 'inactive', 'pending']),
  department: z.string(),
  score: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

async function main() {
  console.log('🚀 Starting Simple Demo\n');

  // 1. Initialize AWS clients and factory
  console.log('1. Initializing AWS clients...');
  const dynamoClient = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: 'http://localhost:8000', // For DynamoDB Local
  });

  const factory = new ModelFactory(dynamoClient);
  const tableManager = new TableManager(dynamoClient);

  // 2. Define User model
  console.log('2. Defining User model...');

  const User = factory.defineModel({
    hashKey: 'id',
    schema: userSchema,
    tableName: 'demo-users',
    timestamps: { createdAt: true, updatedAt: true },
  });

  try {
    // 3. Create table
    console.log('3. Creating table...');

    const tableExists = await tableManager.tableExists('demo-users');
    // remove table if it exists
    if (tableExists) {
      await tableManager.deleteTable('demo-users');
    }
    await tableManager.createTable(User, { read: 5, write: 5 });
    console.log('✅ Users table created');

    // 4. Create sample data
    console.log('\n4. Creating sample data...');

    // Create users
    const users: z.infer<typeof userSchema>[] = [
      { id: 'user1', email: 'alice@company.com', name: 'Alice Johnson', age: 28, status: 'active' as const, department: 'engineering', score: 95 },
      { id: 'user2', email: 'bob@company.com', name: 'Bob Smith', age: 32, status: 'active' as const, department: 'marketing', score: 87 },
      { id: 'user3', email: 'charlie@company.com', name: 'Charlie Brown', age: 24, status: 'pending' as const, department: 'engineering', score: 72 },
      { id: 'user4', email: 'diana@company.com', name: 'Diana Prince', age: 35, status: 'inactive' as const, department: 'sales', score: 98 },
      { id: 'user5', email: 'eve@company.com', name: 'Eve Wilson', age: 29, status: 'active' as const, department: 'engineering', score: 91 },
    ];

    await Promise.all(users.map(userData => User.create(userData)));

    console.log('✅ Sample data created');

    // 5. Demonstrate basic operations
    console.log('\n5. Basic CRUD Operations Demo:');

    // Get a user
    console.log('\n📝 Get user by ID:');
    const user1 = await User.get({ id: 'user1' });
    console.log('Found user:', { id: user1?.id, name: user1?.name, email: user1?.email });

    // Get multiple users
    console.log('\n📝 Get multiple users:');
    const multipleUsers = await User.getMany([
      { id: 'user1' },
      { id: 'user3' },
      { id: 'user5' }
    ]);
    console.log(`Found ${multipleUsers.length} users:`, multipleUsers.map(u => ({ id: u.id, name: u.name })));

    // Update a user
    console.log('\n📝 Update user:');
    const updatedUser = await User.update(
      { id: 'user2' },
      { score: 90, department: 'product' }
    );
    console.log('Updated user:', { id: updatedUser.id, score: updatedUser.score, department: updatedUser.department });

    // Query users
    console.log('\n📝 Query users:');
    const queryResult = await User.query({ id: 'user1' }).filter('name').eq('Alice Johnson').exec();
    console.log('Query result:', queryResult);

    // Query users with filter

  } catch (error) {
    console.error('❌ Demo failed:', error);

    // Clean up table on error
    try {
      console.log('\n🧹 Cleaning up table...');
      await tableManager.deleteTable('demo-users').catch(() => { });
      console.log('✅ Table cleaned up');
    } catch (cleanupError) {
      console.error('Failed to clean up table:', cleanupError);
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

export { main as runDemo };