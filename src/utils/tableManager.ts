import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { getDynamoClient } from './aws.js';
import { DynogelsModel } from '../core/Model.js';
import { Callback, TableCreationOptions } from '../types/dynogels.js';

// Global registry of defined models
const modelRegistry = new Map<string, DynogelsModel<any>>();

/**
 * Register a model in the global registry
 */
export function registerModel(name: string, model: DynogelsModel<any>): void {
  modelRegistry.set(name, model);
}

/**
 * Get a registered model by name
 */
export function getModel(name: string): DynogelsModel<any> | undefined {
  return modelRegistry.get(name);
}

/**
 * Get all registered models
 */
export function getAllModels(): Map<string, DynogelsModel<any>> {
  return new Map(modelRegistry);
}

/**
 * Create tables for all registered models or specific models
 */
export async function createTables(
  options?: Record<string, TableCreationOptions>,
  callback?: Callback<any>
): Promise<any> {
  try {
    const results: any[] = [];
    
    for (const [modelName, model] of modelRegistry) {
      const modelOptions = options?.[modelName];
      const result = await model.createTable(modelOptions);
      results.push(result);
    }
    
    if (callback) {
      callback(null, results);
    }
    
    return results;
    
  } catch (error) {
    if (callback) {
      callback(error as Error);
    }
    throw error;
  }
}

/**
 * Delete tables for all registered models
 */
export async function deleteTables(callback?: Callback<any>): Promise<any> {
  try {
    const results: any[] = [];
    
    for (const [modelName, model] of modelRegistry) {
      try {
        const result = await model.deleteTable();
        results.push(result);
      } catch (error) {
        // Ignore errors for non-existent tables
        if ((error as any).name !== 'ResourceNotFoundException') {
          throw error;
        }
      }
    }
    
    if (callback) {
      callback(null, results);
    }
    
    return results;
    
  } catch (error) {
    if (callback) {
      callback(error as Error);
    }
    throw error;
  }
}

/**
 * Wait for a table to become active
 */
export async function waitForTableActive(
  tableName: string, 
  maxWaitTime: number = 60000
): Promise<void> {
  const dynamoClient = getDynamoClient();
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const { Table } = await dynamoClient.send(
        new CreateTableCommand({ TableName: tableName } as any)
      );
      
      if (Table?.TableStatus === 'ACTIVE') {
        return;
      }
    } catch (error) {
      // Table might not exist yet
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Table ${tableName} did not become active within ${maxWaitTime}ms`);
}

/**
 * Clear the model registry (useful for testing)
 */
export function clearModelRegistry(): void {
  modelRegistry.clear();
}