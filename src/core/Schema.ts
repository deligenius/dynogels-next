import { z } from 'zod';
import { SchemaConfig } from '../types/dynogels.js';
import { DynogelsTypes } from '../utils/types.js';

export class Schema<T extends z.ZodObject<any>> {
  public readonly zodSchema: T;
  public readonly config: SchemaConfig<T>;
  public readonly enhancedSchema: z.ZodObject<any>;
  
  constructor(config: SchemaConfig<T>) {
    this.config = config;
    this.zodSchema = config.schema;
    this.enhancedSchema = this.enhanceSchemaWithTimestamps(config.schema);
  }
  
  private enhanceSchemaWithTimestamps(schema: T): z.ZodObject<any> {
    if (!this.config.timestamps) return schema;
    
    const timestampFields: Record<string, z.ZodDate> = {};
    
    if (this.config.createdAt !== false) {
      const fieldName = typeof this.config.createdAt === 'string' 
        ? this.config.createdAt 
        : 'createdAt';
      timestampFields[fieldName] = DynogelsTypes.date().optional();
    }
    
    if (this.config.updatedAt !== false) {
      const fieldName = typeof this.config.updatedAt === 'string' 
        ? this.config.updatedAt 
        : 'updatedAt';
      timestampFields[fieldName] = DynogelsTypes.date().optional();
    }
    
    return schema.extend(timestampFields);
  }
  
  /**
   * Validate data against the schema
   */
  validate(data: unknown) {
    const transformedData = this.transformDynamoDBData(data);
    return this.enhancedSchema.safeParse(transformedData);
  }
  
  /**
   * Apply default values and validate
   */
  applyDefaults(data: Partial<z.infer<T>>): z.infer<T> {
    return this.enhancedSchema.parse(data);
  }
  
  /**
   * Get the hash key field name
   */
  getHashKey(): keyof z.infer<T> {
    return this.config.hashKey;
  }
  
  /**
   * Get the range key field name (if exists)
   */
  getRangeKey(): keyof z.infer<T> | undefined {
    return this.config.rangeKey;
  }
  
  /**
   * Get the table name (static or dynamic)
   */
  getTableName(): string {
    if (typeof this.config.tableName === 'function') {
      return this.config.tableName();
    }
    return this.config.tableName || 'UnnamedTable';
  }
  
  /**
   * Check if timestamps are enabled
   */
  hasTimestamps(): boolean {
    return this.config.timestamps === true;
  }
  
  /**
   * Get the createdAt field name
   */
  getCreatedAtField(): string | null {
    if (this.config.timestamps === false || this.config.createdAt === false) {
      return null;
    }
    return typeof this.config.createdAt === 'string' ? this.config.createdAt : 'createdAt';
  }
  
  /**
   * Get the updatedAt field name
   */
  getUpdatedAtField(): string | null {
    if (this.config.timestamps === false || this.config.updatedAt === false) {
      return null;
    }
    return typeof this.config.updatedAt === 'string' ? this.config.updatedAt : 'updatedAt';
  }
  
  /**
   * Add timestamps to data for creation
   */
  addTimestampsForCreate(data: any): any {
    if (!this.hasTimestamps()) return data;
    
    const now = new Date().toISOString();
    const result = { ...data };
    
    const createdAtField = this.getCreatedAtField();
    if (createdAtField && !result[createdAtField]) {
      result[createdAtField] = now;
    }
    
    const updatedAtField = this.getUpdatedAtField();
    if (updatedAtField && !result[updatedAtField]) {
      result[updatedAtField] = now;
    }
    
    return result;
  }
  
  /**
   * Add timestamps to data for updates
   */
  addTimestampsForUpdate(data: any): any {
    if (!this.hasTimestamps()) return data;
    
    const updatedAtField = this.getUpdatedAtField();
    if (updatedAtField) {
      return {
        ...data,
        [updatedAtField]: new Date().toISOString()
      };
    }
    
    return data;
  }
  
  /**
   * Extract key from item data
   */
  extractKey(item: any): Record<string, any> {
    const key: Record<string, any> = {
      [this.getHashKey() as string]: item[this.getHashKey() as string]
    };
    
    const rangeKey = this.getRangeKey();
    if (rangeKey) {
      key[rangeKey as string] = item[rangeKey as string];
    }
    
    return key;
  }
  
  /**
   * Get secondary indexes configuration
   */
  getIndexes() {
    return this.config.indexes || [];
  }
  
  /**
   * Find index by name
   */
  getIndex(name: string) {
    return this.getIndexes().find(index => index.name === name);
  }
  
  /**
   * Transform raw DynamoDB data to expected schema format
   */
  transformDynamoDBData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const transformed = { ...data };
    
    // Transform Set objects to arrays for validation
    for (const [key, value] of Object.entries(transformed)) {
      if (value instanceof Set) {
        transformed[key] = Array.from(value);
      }
    }
    
    return transformed;
  }
}