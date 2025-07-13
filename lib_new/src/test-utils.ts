import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { Dynogels } from "./Table.js";

/**
 * Test utilities for DynamoDB testing with local instance
 */

// Test client configuration for local DynamoDB
export const createTestClient = () => {
  return new DynamoDBClient({
    endpoint: "http://localhost:8000",
    region: "us-east-1",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  });
};

// Initialize Dynogels for testing
export const initializeTestDynogels = () => {
  const client = createTestClient();
  Dynogels.initialize(client);
  return client;
};

// Test schemas for different use cases
export const TestSchemas = {
  Simple: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email().optional(),
  }),

  WithRange: z.object({
    pk: z.string(),
    sk: z.string(),
    data: z.string(),
    count: z.number().optional(),
  }),

  Complex: z.object({
    id: z.string(),
    timestamp: z.string().datetime(),
    string: z.string(),
    number: z.number(),
    boolean: z.boolean(),
    nullable: z.string().nullable(),
    array: z.array(z.string()),
    object: z.object({
      nested: z.string(),
      value: z.number(),
    }),
    numberSet: z.set(z.number()),
    stringSet: z.set(z.string()),
    uint8Array: z.instanceof(Uint8Array),
  }),
};

// Helper to create test models
export const createTestModel = (name: string, schema: z.ZodObject<any>, options: any = {}) => {
  return Dynogels.define(name, {
    schema,
    ...options,
  });
};

// Helper to generate unique table names for tests
export const generateTableName = (prefix: string = "test") => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}_${timestamp}_${random}`;
};

// Helper to wait for table to be active
export const waitForTable = async (model: any, maxWaitTime = 30000) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      await model.describeTable();
      return true;
    } catch (error) {
      // Table might not exist yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Table did not become active within ${maxWaitTime}ms`);
};

// Cleanup helper to delete test tables
export const cleanupTable = async (model: any) => {
  try {
    await model.deleteTable();
    // Wait a bit for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    // Table might not exist, ignore error
    console.warn(`Failed to cleanup table: ${error}`);
  }
};

// Generate test data
export const generateTestData = {
  simple: (id: string = "test-id") => ({
    id,
    name: `Test User ${id}`,
    email: `test-${id}@example.com`,
  }),

  withRange: (pk: string = "test-pk", sk: string = "test-sk") => ({
    pk,
    sk,
    data: `Test data for ${pk}:${sk}`,
    count: Math.floor(Math.random() * 100),
  }),

  complex: (id: string = "test-id") => ({
    id,
    timestamp: new Date().toISOString(),
    string: `Test string ${id}`,
    number: Math.floor(Math.random() * 1000),
    boolean: Math.random() > 0.5,
    nullable: Math.random() > 0.5 ? `nullable-${id}` : null,
    array: [`item1-${id}`, `item2-${id}`, `item3-${id}`],
    object: {
      nested: `nested-${id}`,
      value: Math.floor(Math.random() * 100),
    },
    numberSet: new Set([1, 2, 3, Math.floor(Math.random() * 100)]),
    stringSet: new Set([`set1-${id}`, `set2-${id}`, `set3-${id}`]),
    uint8Array: new Uint8Array([1, 2, 3, 4, 5]),
  }),
};

// Error matchers for testing
export const ErrorMatchers = {
  ValidationError: /validation/i,
  ItemNotFound: /not found/i,
  TableNotFound: /table.*not.*found/i,
  ConditionalCheckFailed: /conditional.*check.*failed/i,
};