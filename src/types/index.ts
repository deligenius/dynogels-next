export * from './dynogels.js';

// Re-export Zod for convenience
export { z } from 'zod';

// Re-export AWS SDK types that might be needed
export type { 
  DynamoDBClient,
  DynamoDBClientConfig 
} from '@aws-sdk/client-dynamodb';

export type { 
  DynamoDBDocument,
  DynamoDBDocumentClient 
} from '@aws-sdk/lib-dynamodb';