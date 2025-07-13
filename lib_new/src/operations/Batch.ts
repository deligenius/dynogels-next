import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Schema } from '../core/Schema.js';
import { Item } from '../core/Item.js';
import { BatchGetOptions } from '../types/dynogels.js';

export class BatchOperations<T> {
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>
  ) {}
  
  /**
   * Batch get multiple items by their keys
   */
  async getItems(
    keys: any[], 
    options?: BatchGetOptions
  ): Promise<Item<T>[]> {
    if (keys.length === 0) {
      return [];
    }
    
    const chunks = this.chunkArray(keys, 100); // DynamoDB batch limit
    const results: Item<T>[] = [];
    
    for (const chunk of chunks) {
      // Convert keys to proper DynamoDB key format
      const formattedKeys = chunk.map(key => {
        if (typeof key === 'object' && key !== null) {
          // Key is already an object, return as-is
          return key;
        } else {
          // Key is a simple value, format it with the hash key name
          return {
            [this.schema.getHashKey() as string]: key
          };
        }
      });
      
      const params: any = {
        RequestItems: {
          [this.tableName]: {
            Keys: formattedKeys,
          },
        },
      };
      
      // Add options if provided
      if (options?.ConsistentRead) {
        params.RequestItems[this.tableName].ConsistentRead = options.ConsistentRead;
      }
      
      if (options?.ProjectionExpression) {
        params.RequestItems[this.tableName].ProjectionExpression = options.ProjectionExpression;
      }
      
      if (options?.ExpressionAttributeNames) {
        params.RequestItems[this.tableName].ExpressionAttributeNames = options.ExpressionAttributeNames;
      }
      
      let response = await this.docClient.batchGet(params);
      
      // Process the response
      const items = response.Responses?.[this.tableName] || [];
      
      for (const item of items) {
        const validatedItem = this.schema.validate(item);
        if (!validatedItem.success) {
          throw new Error(`Invalid item data: ${validatedItem.error.message}`);
        }
        results.push(new Item(validatedItem.data, this.getTable()));
      }
      
      // Handle unprocessed keys by retrying
      while (response.UnprocessedKeys && Object.keys(response.UnprocessedKeys).length > 0) {
        // Wait a bit before retrying
        await this.delay(100);
        
        response = await this.docClient.batchGet({
          RequestItems: response.UnprocessedKeys,
        });
        
        const retryItems = response.Responses?.[this.tableName] || [];
        for (const item of retryItems) {
          const validatedItem = this.schema.validate(item);
          if (!validatedItem.success) {
            throw new Error(`Invalid item data: ${validatedItem.error.message}`);
          }
          results.push(new Item(validatedItem.data, this.getTable()));
        }
      }
    }
    
    return results;
  }
  
  /**
   * Batch write multiple items (put and delete operations)
   */
  async batchWrite(requests: BatchWriteRequest[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }
    
    const chunks = this.chunkArray(requests, 25); // DynamoDB batch write limit
    
    for (const chunk of chunks) {
      const writeRequests = chunk.map(request => {
        if (request.type === 'put') {
          // Add timestamps if this is a create operation
          const itemWithTimestamps = this.schema.addTimestampsForCreate(request.item);
          return {
            PutRequest: {
              Item: itemWithTimestamps,
            },
          };
        } else {
          return {
            DeleteRequest: {
              Key: request.key,
            },
          };
        }
      });
      
      const params = {
        RequestItems: {
          [this.tableName]: writeRequests,
        },
      };
      
      let response = await this.docClient.batchWrite(params);
      
      // Handle unprocessed items by retrying
      while (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
        // Wait a bit before retrying
        await this.delay(100);
        
        response = await this.docClient.batchWrite({
          RequestItems: response.UnprocessedItems,
        });
      }
    }
  }
  
  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get table reference (temporary hack until we fix circular dependencies)
   */
  private getTable(): any {
    return null; // Will be fixed when we implement the full model
  }
}

export interface BatchWriteRequest {
  type: 'put' | 'delete';
  item?: any;
  key?: any;
}