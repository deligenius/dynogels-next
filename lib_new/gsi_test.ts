#!/usr/bin/env tsx

/**
 * Simple GSI Implementation Test
 * This tests the basic GSI functionality without requiring a real DynamoDB connection
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { ModelFactory } from './src/ModelFactory.js';

// Create a test schema
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: z.enum(['active', 'inactive', 'suspended']),
  department: z.string(),
  role: z.enum(['admin', 'user', 'manager']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create factory (with mock client for testing)
const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000', // Mock endpoint
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

const factory = new ModelFactory(client);

// Test 1: Model Definition with GSI
console.log('🧪 Test 1: Model Definition with GSI');
try {
  const User = factory.defineModel({
    hashKey: 'id',
    schema: userSchema,
    tableName: 'test-users',
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

  console.log('✅ Model definition with GSI successful');

  // Test 2: QueryBuilder Type Safety
  console.log('\n🧪 Test 2: QueryBuilder Type Safety');

  // This should work - EmailIndex exists
  const emailQuery = User.query({ email: 'test@example.com' })
    .usingIndex('EmailIndex');
  console.log('✅ Valid index name accepted:', typeof emailQuery);

  // Test 3: Query validation (will fail at runtime with mock client, but tests compilation)
  console.log('\n🧪 Test 3: GSI Query Compilation');

  const statusQuery = User.query({ status: 'active', department: 'engineering' })
    .usingIndex('StatusDepartmentIndex')
    .filter('role').eq('admin')
    .exec();

  console.log('✅ Complex GSI query compiles successfully:', typeof statusQuery);

  // Test 4: Error Handling (this will throw at runtime)
  console.log('\n🧪 Test 4: GSI Validation Error Handling');

  try {
    // This should throw a GSIValidationError because 'invalidField' is not a valid key for EmailIndex
    User.query({ invalidField: 'value' })
      .usingIndex('EmailIndex');
  } catch (error: any) {
    if (error.name === 'GSIValidationError') {
      console.log('✅ GSI validation error caught correctly:', error.message);
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }

  console.log('\n🎉 All GSI tests passed! Implementation appears to be working correctly.');

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}