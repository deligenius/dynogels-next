import { z } from 'zod';

// Core DynamoDB types
export type DynamoDBValue = string | number | boolean | Uint8Array | null | undefined | DynamoDBValue[] | { [key: string]: DynamoDBValue };

// Key types for hash and range keys
export type KeyType<T, THashKey extends keyof T, TRangeKey extends keyof T | undefined = undefined> = 
  TRangeKey extends keyof T 
    ? { [K in THashKey | TRangeKey]: T[K] }
    : { [K in THashKey]: T[K] };

// Secondary index configuration
export interface SecondaryIndex {
  name: string;
  type: 'local' | 'global';
  hashKey: string;
  rangeKey?: string;
  projection?: {
    ProjectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    NonKeyAttributes?: string[];
  };
  readCapacity?: number;
  writeCapacity?: number;
}

// Schema configuration interface
export interface SchemaConfig<T extends z.ZodObject<any>> {
  hashKey: keyof z.infer<T>;
  rangeKey?: keyof z.infer<T>;
  schema: T;
  tableName?: string | (() => string);
  timestamps?: boolean;
  createdAt?: string | boolean;
  updatedAt?: string | boolean;
  indexes?: SecondaryIndex[];
  validation?: {
    allowUnknown?: boolean;
    abortEarly?: boolean;
  };
}

// Options for various operations
export interface CreateOptions {
  condition?: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

export interface GetOptions {
  ConsistentRead?: boolean;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  AttributesToGet?: string[];
}

export interface UpdateOptions {
  condition?: string;
  conditionExpression?: string;
  updateExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
  expected?: Record<string, any>;
}

export interface DeleteOptions {
  condition?: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD';
}

// Query and Scan result types
export interface QueryResult<T> {
  Items: T[];
  Count: number;
  ScannedCount: number;
  LastEvaluatedKey?: Record<string, any>;
  ConsumedCapacity?: any;
}

export interface ScanResult<T> {
  Items: T[];
  Count: number;
  ScannedCount: number;
  LastEvaluatedKey?: Record<string, any>;
  ConsumedCapacity?: any;
}

// Condition types for query builder
export type ConditionOperator = 
  | 'EQ' 
  | 'NE' 
  | 'LT' 
  | 'LE' 
  | 'GT' 
  | 'GE' 
  | 'BETWEEN' 
  | 'IN' 
  | 'BEGINS_WITH' 
  | 'CONTAINS' 
  | 'NOT_CONTAINS' 
  | 'NULL' 
  | 'NOT_NULL';

export interface QueryCondition {
  field: string;
  operator: ConditionOperator;
  value?: any;
  values?: any[];
}

export interface FilterCondition {
  field: string;
  operator: ConditionOperator;
  value?: any;
  values?: any[];
}

// Table creation options
export interface TableCreationOptions {
  readCapacity?: number;
  writeCapacity?: number;
  streamSpecification?: {
    StreamEnabled: boolean;
    StreamViewType?: 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';
  };
  sseSpecification?: {
    Enabled: boolean;
    KMSMasterKeyId?: string;
    SSEType?: 'AES256' | 'KMS';
  };
  tags?: Array<{
    Key: string;
    Value: string;
  }>;
}

// Batch operation types
export interface BatchGetOptions {
  ConsistentRead?: boolean;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
}

// AWS configuration
export interface AWSConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  sessionToken?: string;
  credentials?: any;
}

// Callback types for backward compatibility
export type Callback<T> = (error?: Error | null, result?: T) => void;

// Model instance type
export interface ModelInstance<T> {
  get<K extends keyof T>(field: K): T[K];
  set<K extends keyof T>(field: K, value: T[K]): this;
  save(callback?: Callback<ModelInstance<T>>): Promise<ModelInstance<T>>;
  destroy(callback?: Callback<void>): Promise<void>;
  update(updates: Partial<T>, options?: UpdateOptions, callback?: Callback<ModelInstance<T>>): Promise<ModelInstance<T>>;
  toJSON(): T;
}

// Model static interface
export interface ModelStatic<T> {
  create(item: Partial<T>, callback?: Callback<ModelInstance<T>>): Promise<ModelInstance<T>>;
  create(items: Partial<T>[], callback?: Callback<ModelInstance<T>[]>): Promise<ModelInstance<T>[]>;
  get(key: any, callback?: Callback<ModelInstance<T> | null>): Promise<ModelInstance<T> | null>;
  get(hashKey: any, rangeKey: any, callback?: Callback<ModelInstance<T> | null>): Promise<ModelInstance<T> | null>;
  update(key: any, updates: any, options?: UpdateOptions, callback?: Callback<ModelInstance<T>>): Promise<ModelInstance<T>>;
  destroy(key: any, options?: DeleteOptions, callback?: Callback<void>): Promise<void>;
  query(hashKey: any): any; // Will be properly typed in Query class
  scan(): any; // Will be properly typed in Scan class
  getItems(keys: any[], options?: BatchGetOptions, callback?: Callback<ModelInstance<T>[]>): Promise<ModelInstance<T>[]>;
  createTable(options?: TableCreationOptions, callback?: Callback<any>): Promise<any>;
  deleteTable(callback?: Callback<any>): Promise<any>;
  describeTable(callback?: Callback<any>): Promise<any>;
  parallelScan(segments: number): any; // Will be properly typed in ParallelScan class
}