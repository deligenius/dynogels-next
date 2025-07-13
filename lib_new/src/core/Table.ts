import { z } from 'zod';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { 
  CreateTableCommand, 
  DeleteTableCommand, 
  DescribeTableCommand,
  DynamoDBClient 
} from '@aws-sdk/client-dynamodb';

import { Schema } from './Schema.js';
import { Item } from './Item.js';
import { Query } from '../operations/Query.js';
import { Scan } from '../operations/Scan.js';
import { BatchOperations } from '../operations/Batch.js';
import { ParallelScan } from '../operations/ParallelScan.js';

import { 
  CreateOptions, 
  GetOptions, 
  UpdateOptions, 
  DeleteOptions,
  KeyType,
  Callback,
  TableCreationOptions,
  BatchGetOptions
} from '../types/dynogels.js';

import { buildUpdateExpression, buildConditionExpression } from '../utils/expressions.js';

export class Table<
  TSchema extends z.ZodObject<any>,
  TType = z.infer<TSchema>,
  THashKey extends keyof TType = keyof TType,
  TRangeKey extends keyof TType | undefined = undefined
> {
  private docClient: DynamoDBDocument;
  private dynamoClient: DynamoDBClient;
  private schema: Schema<TSchema>;
  private tableName: string;
  private batchOps: BatchOperations<TType>;
  
  constructor(
    docClient: DynamoDBDocument,
    dynamoClient: DynamoDBClient,
    schema: Schema<TSchema>,
    tableName?: string
  ) {
    this.docClient = docClient;
    this.dynamoClient = dynamoClient;
    this.schema = schema;
    this.tableName = tableName || schema.getTableName();
    this.batchOps = new BatchOperations(docClient, this.tableName, schema);
  }
  
  /**
   * Get the schema instance
   */
  getSchema(): Schema<TSchema> {
    return this.schema;
  }
  
  /**
   * Get the table name
   */
  getTableName(): string {
    return this.tableName;
  }
  
  /**
   * Create a new item
   */
  async create(
    item: Partial<TType> | Partial<TType>[], 
    options?: CreateOptions,
    callback?: Callback<Item<TType> | Item<TType>[]>
  ): Promise<Item<TType> | Item<TType>[]> {
    try {
      // Handle array of items
      if (Array.isArray(item)) {
        const results: Item<TType>[] = [];
        for (const singleItem of item) {
          const result = await this.createSingle(singleItem, options);
          results.push(result);
        }
        
        if (callback) {
          callback(null, results);
        }
        return results;
      }
      
      // Handle single item
      const result = await this.createSingle(item, options);
      if (callback) {
        callback(null, result);
      }
      return result;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  private async createSingle(item: Partial<TType>, options?: CreateOptions): Promise<Item<TType>> {
    // Apply defaults and validate
    let validatedItem: TType;
    try {
      validatedItem = this.schema.applyDefaults(item);
    } catch (error) {
      throw new Error(`Validation error: ${error}`);
    }
    
    // Add timestamps if enabled
    const itemWithTimestamps = this.schema.addTimestampsForCreate(validatedItem);
    
    // Build the put parameters
    const params: any = {
      TableName: this.tableName,
      Item: itemWithTimestamps,
    };
    
    // Add condition expressions if provided
    if (options?.conditionExpression) {
      params.ConditionExpression = options.conditionExpression;
    }
    
    if (options?.expressionAttributeNames) {
      params.ExpressionAttributeNames = options.expressionAttributeNames;
    }
    
    if (options?.expressionAttributeValues) {
      params.ExpressionAttributeValues = options.expressionAttributeValues;
    }
    
    if (options?.returnValues) {
      params.ReturnValues = options.returnValues;
    }
    
    await this.docClient.put(params);
    
    return new Item(itemWithTimestamps, this);
  }
  
  /**
   * Get an item by key
   */
  async get(
    key: KeyType<TType, THashKey, TRangeKey> | any,
    rangeKey?: any,
    options?: GetOptions,
    callback?: Callback<Item<TType> | null>
  ): Promise<Item<TType> | null> {
    try {
      // Handle overloaded parameters
      let actualKey: any;
      let actualOptions: GetOptions | undefined;
      let actualCallback: Callback<Item<TType> | null> | undefined;
      
      if (typeof rangeKey === 'function') {
        // get(hashKey, callback)
        actualKey = { [this.schema.getHashKey() as string]: key };
        actualCallback = rangeKey;
      } else if (typeof options === 'function') {
        // get(hashKey, rangeKey, callback)
        actualKey = this.buildKey(key, rangeKey);
        actualCallback = options;
      } else if (typeof key === 'object' && !Array.isArray(key)) {
        // get(keyObject, options, callback)
        actualKey = key;
        actualOptions = rangeKey as GetOptions;
        actualCallback = options as Callback<Item<TType> | null>;
      } else {
        // get(hashKey, rangeKey, options, callback)
        actualKey = this.buildKey(key, rangeKey);
        actualOptions = options;
        actualCallback = callback;
      }
      
      const result = await this.docClient.get({
        TableName: this.tableName,
        Key: actualKey,
        ...actualOptions,
      });
      
      let item: Item<TType> | null = null;
      if (result.Item) {
        const validatedItem = this.schema.validate(result.Item);
        if (!validatedItem.success) {
          throw new Error(`Invalid item data: ${validatedItem.error.message}`);
        }
        item = new Item(validatedItem.data, this);
      }
      
      if (actualCallback) {
        actualCallback(null, item);
      }
      
      return item;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Update an item
   */
  async update(
    key: any,
    updates: any,
    options?: UpdateOptions,
    callback?: Callback<Item<TType>>
  ): Promise<Item<TType>> {
    try {
      // Handle overloaded parameters
      let actualKey: any;
      let actualUpdates: any;
      let actualOptions: UpdateOptions | undefined;
      let actualCallback: Callback<Item<TType>> | undefined;
      
      if (typeof options === 'function') {
        actualKey = key;
        actualUpdates = updates;
        actualCallback = options;
      } else {
        actualKey = key;
        actualUpdates = updates;
        actualOptions = options;
        actualCallback = callback;
      }
      
      // Add timestamps for update
      const updatesWithTimestamps = this.schema.addTimestampsForUpdate(actualUpdates);
      
      // Build update expression
      const expression = buildUpdateExpression(updatesWithTimestamps);
      
      // Build parameters
      const params: any = {
        TableName: this.tableName,
        Key: actualKey,
        ReturnValues: actualOptions?.returnValues || 'ALL_NEW',
        ...expression,
      };
      
      // Add condition expressions if provided
      if (actualOptions?.conditionExpression) {
        params.ConditionExpression = actualOptions.conditionExpression;
      }
      
      if (actualOptions?.expected) {
        const conditionExpr = buildConditionExpression(actualOptions.expected);
        if (conditionExpr.ConditionExpression) {
          params.ConditionExpression = conditionExpr.ConditionExpression;
          Object.assign(params.ExpressionAttributeNames || {}, conditionExpr.ExpressionAttributeNames || {});
          Object.assign(params.ExpressionAttributeValues || {}, conditionExpr.ExpressionAttributeValues || {});
        }
      }
      
      const result = await this.docClient.update(params);
      
      if (!result.Attributes) {
        throw new Error('Update operation did not return updated item');
      }
      
      const validatedItem = this.schema.validate(result.Attributes);
      if (!validatedItem.success) {
        throw new Error(`Invalid updated item data: ${validatedItem.error.message}`);
      }
      
      const item = new Item(validatedItem.data, this);
      
      if (actualCallback) {
        actualCallback(null, item);
      }
      
      return item;
      
    } catch (error) {
      if (actualCallback) {
        actualCallback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Delete an item
   */
  async destroy(
    key: any,
    options?: DeleteOptions,
    callback?: Callback<void>
  ): Promise<void> {
    try {
      // Handle overloaded parameters
      let actualOptions: DeleteOptions | undefined;
      let actualCallback: Callback<void> | undefined;
      
      if (typeof options === 'function') {
        actualCallback = options;
      } else {
        actualOptions = options;
        actualCallback = callback;
      }
      
      await this.docClient.delete({
        TableName: this.tableName,
        Key: key,
        ...actualOptions,
      });
      
      if (actualCallback) {
        actualCallback();
      }
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Create a query builder
   */
  query(hashKey: TType[THashKey]): Query<TType> {
    return new Query(this.docClient, this.tableName, this.schema, hashKey);
  }
  
  /**
   * Create a scan builder
   */
  scan(): Scan<TType> {
    return new Scan(this.docClient, this.tableName, this.schema);
  }
  
  /**
   * Create a parallel scan builder
   */
  parallelScan(segments: number): ParallelScan<TType> {
    return new ParallelScan(this.docClient, this.tableName, this.schema, segments);
  }
  
  /**
   * Batch get items
   */
  async getItems(
    keys: any[],
    options?: BatchGetOptions,
    callback?: Callback<Item<TType>[]>
  ): Promise<Item<TType>[]> {
    try {
      const result = await this.batchOps.getItems(keys, options);
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Create the table
   */
  async createTable(
    options?: TableCreationOptions,
    callback?: Callback<any>
  ): Promise<any> {
    try {
      const params = this.buildCreateTableParams(options);
      const command = new CreateTableCommand(params);
      const result = await this.dynamoClient.send(command);
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Delete the table
   */
  async deleteTable(callback?: Callback<any>): Promise<any> {
    try {
      const command = new DeleteTableCommand({
        TableName: this.tableName,
      });
      const result = await this.dynamoClient.send(command);
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Describe the table
   */
  async describeTable(callback?: Callback<any>): Promise<any> {
    try {
      const command = new DescribeTableCommand({
        TableName: this.tableName,
      });
      const result = await this.dynamoClient.send(command);
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Build key object from hash and optional range key
   */
  private buildKey(hashKey: any, rangeKey?: any): any {
    const key: any = {
      [this.schema.getHashKey() as string]: hashKey
    };
    
    const rangeKeyField = this.schema.getRangeKey();
    if (rangeKeyField && rangeKey !== undefined) {
      key[rangeKeyField as string] = rangeKey;
    }
    
    return key;
  }
  
  /**
   * Build parameters for CreateTable operation
   */
  private buildCreateTableParams(options?: TableCreationOptions): any {
    const hashKey = this.schema.getHashKey() as string;
    const rangeKey = this.schema.getRangeKey() as string;
    
    const keySchema: any[] = [
      {
        AttributeName: hashKey,
        KeyType: 'HASH'
      }
    ];
    
    const attributeDefinitions: any[] = [
      {
        AttributeName: hashKey,
        AttributeType: 'S' // Default to string, could be enhanced with type detection
      }
    ];
    
    if (rangeKey) {
      keySchema.push({
        AttributeName: rangeKey,
        KeyType: 'RANGE'
      });
      
      attributeDefinitions.push({
        AttributeName: rangeKey,
        AttributeType: 'S'
      });
    }
    
    const params: any = {
      TableName: this.tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: 'PAY_PER_REQUEST'
    };
    
    // Add provisioned throughput if specified
    if (options?.readCapacity || options?.writeCapacity) {
      params.BillingMode = 'PROVISIONED';
      params.ProvisionedThroughput = {
        ReadCapacityUnits: options.readCapacity || 5,
        WriteCapacityUnits: options.writeCapacity || 5
      };
    }
    
    // Add global secondary indexes
    const indexes = this.schema.getIndexes();
    if (indexes.length > 0) {
      params.GlobalSecondaryIndexes = indexes
        .filter(index => index.type === 'global')
        .map(index => ({
          IndexName: index.name,
          KeySchema: [
            {
              AttributeName: index.hashKey,
              KeyType: 'HASH'
            },
            ...(index.rangeKey ? [{
              AttributeName: index.rangeKey,
              KeyType: 'RANGE'
            }] : [])
          ],
          Projection: index.projection || { ProjectionType: 'ALL' },
          ...(params.BillingMode === 'PROVISIONED' ? {
            ProvisionedThroughput: {
              ReadCapacityUnits: index.readCapacity || 5,
              WriteCapacityUnits: index.writeCapacity || 5
            }
          } : {})
        }));
      
      // Add attribute definitions for index keys
      indexes.forEach(index => {
        if (!attributeDefinitions.find(attr => attr.AttributeName === index.hashKey)) {
          attributeDefinitions.push({
            AttributeName: index.hashKey,
            AttributeType: 'S'
          });
        }
        
        if (index.rangeKey && !attributeDefinitions.find(attr => attr.AttributeName === index.rangeKey)) {
          attributeDefinitions.push({
            AttributeName: index.rangeKey,
            AttributeType: 'S'
          });
        }
      });
    }
    
    return params;
  }
}