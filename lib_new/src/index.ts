import { z } from 'zod';
import { DynogelsModel } from './core/Model.js';
import { Schema } from './core/Schema.js';
import { Table } from './core/Table.js';
import { Item } from './core/Item.js';

import { configureAWS, getDynamoClient, getDocClient, setClients, resetClients } from './utils/aws.js';
import { DynogelsTypes } from './utils/types.js';
import { 
  registerModel, 
  getModel, 
  getAllModels, 
  createTables, 
  deleteTables,
  clearModelRegistry
} from './utils/tableManager.js';

import { 
  SchemaConfig,
  AWSConfig,
  TableCreationOptions,
  ModelStatic,
  Callback
} from './types/dynogels.js';

/**
 * Define a new model with schema and configuration
 */
export function define<T extends z.ZodObject<any>>(
  modelName: string,
  config: SchemaConfig<T>
): ModelStatic<z.infer<T>> {
  const docClient = getDocClient();
  const dynamoClient = getDynamoClient();
  
  const model = new DynogelsModel(docClient, dynamoClient, config, config.tableName as string || modelName);
  
  // Register the model globally
  registerModel(modelName, model);
  
  return model as ModelStatic<z.infer<T>>;
}

/**
 * AWS configuration object for backward compatibility
 */
export const AWS = {
  config: {
    update: (config: AWSConfig) => {
      configureAWS(config);
    }
  },
  DynamoDB: {
    DocumentClient: class {
      constructor(options: AWSConfig) {
        configureAWS(options);
      }
    }
  }
};

/**
 * Types export for convenience (equivalent to dynogels.types)
 */
export const types = DynogelsTypes;

// Export the main functions
export { 
  createTables,
  deleteTables,
  configureAWS,
  setClients,
  resetClients,
  clearModelRegistry 
};

// Export types and classes for advanced usage
export type {
  SchemaConfig,
  AWSConfig,
  TableCreationOptions,
  ModelStatic,
  Callback
} from './types/dynogels.js';

export {
  z,
  Schema,
  Table,
  Item,
  DynogelsModel
};

// Default export for ES modules
const dynogels = {
  define,
  createTables,
  deleteTables,
  types: DynogelsTypes,
  AWS,
  configureAWS,
  setClients,
  resetClients,
  clearModelRegistry,
  
  // Re-export everything for backward compatibility
  Schema,
  Table,
  Item,
  DynogelsModel,
  z
};

export default dynogels;