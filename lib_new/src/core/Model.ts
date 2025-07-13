import { z } from 'zod';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { Schema } from './Schema.js';
import { Table } from './Table.js';
import { Item } from './Item.js';

import { 
  SchemaConfig,
  ModelStatic,
  ModelInstance,
  CreateOptions,
  GetOptions,
  UpdateOptions,
  DeleteOptions,
  BatchGetOptions,
  TableCreationOptions,
  Callback
} from '../types/dynogels.js';

export class DynogelsModel<T extends z.ZodObject<any>> implements ModelStatic<z.infer<T>> {
  private table: Table<T>;
  private schema: Schema<T>;
  
  constructor(
    docClient: DynamoDBDocument,
    dynamoClient: DynamoDBClient,
    schemaConfig: SchemaConfig<T>,
    tableName?: string
  ) {
    this.schema = new Schema(schemaConfig);
    this.table = new Table(docClient, dynamoClient, this.schema, tableName);
  }
  
  /**
   * Create one or more items
   */
  async create(
    item: Partial<z.infer<T>>,
    callback?: Callback<ModelInstance<z.infer<T>>>
  ): Promise<ModelInstance<z.infer<T>>>;
  async create(
    items: Partial<z.infer<T>>[],
    callback?: Callback<ModelInstance<z.infer<T>>[]>
  ): Promise<ModelInstance<z.infer<T>>[]>;
  async create(
    item: Partial<z.infer<T>> | Partial<z.infer<T>>[],
    callback?: Callback<ModelInstance<z.infer<T>> | ModelInstance<z.infer<T>>[]>
  ): Promise<ModelInstance<z.infer<T>> | ModelInstance<z.infer<T>>[]> {
    const result = await this.table.create(item as any);
    
    if (callback) {
      callback(null, result as any);
    }
    
    return result as any;
  }
  
  /**
   * Get an item by key
   */
  async get(
    key: any,
    callback?: Callback<ModelInstance<z.infer<T>> | null>
  ): Promise<ModelInstance<z.infer<T>> | null>;
  async get(
    hashKey: any,
    rangeKey: any,
    callback?: Callback<ModelInstance<z.infer<T>> | null>
  ): Promise<ModelInstance<z.infer<T>> | null>;
  async get(
    hashKey: any,
    rangeKey?: any,
    callback?: Callback<ModelInstance<z.infer<T>> | null>
  ): Promise<ModelInstance<z.infer<T>> | null> {
    const result = await this.table.get(hashKey, rangeKey, undefined, callback);
    return result as any;
  }
  
  /**
   * Update an item
   */
  async update(
    key: any,
    updates: any,
    options?: UpdateOptions,
    callback?: Callback<ModelInstance<z.infer<T>>>
  ): Promise<ModelInstance<z.infer<T>>> {
    const result = await this.table.update(key, updates, options, callback);
    return result as any;
  }
  
  /**
   * Delete an item
   */
  async destroy(
    key: any,
    options?: DeleteOptions,
    callback?: Callback<void>
  ): Promise<void> {
    return this.table.destroy(key, options, callback);
  }
  
  /**
   * Create a query builder
   */
  query(hashKey: any) {
    return this.table.query(hashKey);
  }
  
  /**
   * Create a scan builder
   */
  scan() {
    return this.table.scan();
  }
  
  /**
   * Create a parallel scan builder
   */
  parallelScan(segments: number) {
    return this.table.parallelScan(segments);
  }
  
  /**
   * Batch get items
   */
  async getItems(
    keys: any[],
    options?: BatchGetOptions,
    callback?: Callback<ModelInstance<z.infer<T>>[]>
  ): Promise<ModelInstance<z.infer<T>>[]> {
    const result = await this.table.getItems(keys, options, callback);
    return result as any;
  }
  
  /**
   * Create the table
   */
  async createTable(
    options?: TableCreationOptions,
    callback?: Callback<any>
  ): Promise<any> {
    return this.table.createTable(options, callback);
  }
  
  /**
   * Delete the table
   */
  async deleteTable(callback?: Callback<any>): Promise<any> {
    return this.table.deleteTable(callback);
  }
  
  /**
   * Describe the table
   */
  async describeTable(callback?: Callback<any>): Promise<any> {
    return this.table.describeTable(callback);
  }
  
  /**
   * Get the underlying table instance
   */
  getTable(): Table<T> {
    return this.table;
  }
  
  /**
   * Get the schema instance
   */
  getSchema(): Schema<T> {
    return this.schema;
  }
}