import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AWSConfig } from '../types/dynogels.js';

let globalDynamoClient: DynamoDBClient | null = null;
let globalDocClient: DynamoDBDocument | null = null;

/**
 * Configure AWS clients with provided configuration
 */
export function configureAWS(config: AWSConfig): void {
  const clientConfig: DynamoDBClientConfig = {};
  
  if (config.region) {
    clientConfig.region = config.region;
  }
  
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }
  
  if (config.credentials) {
    clientConfig.credentials = config.credentials;
  } else if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    };
  }
  
  globalDynamoClient = new DynamoDBClient(clientConfig);
  globalDocClient = DynamoDBDocument.from(globalDynamoClient);
}

/**
 * Get the global DynamoDB client
 */
export function getDynamoClient(): DynamoDBClient {
  if (!globalDynamoClient) {
    // Create a default client if none configured
    globalDynamoClient = new DynamoDBClient({});
  }
  return globalDynamoClient;
}

/**
 * Get the global DynamoDB Document client
 */
export function getDocClient(): DynamoDBDocument {
  if (!globalDocClient) {
    // Create a default client if none configured
    const dynamoClient = getDynamoClient();
    globalDocClient = DynamoDBDocument.from(dynamoClient);
  }
  return globalDocClient;
}

/**
 * Set custom clients (for testing or advanced usage)
 */
export function setClients(dynamoClient: DynamoDBClient, docClient: DynamoDBDocument): void {
  globalDynamoClient = dynamoClient;
  globalDocClient = docClient;
}

/**
 * Reset clients to null (for testing)
 */
export function resetClients(): void {
  globalDynamoClient = null;
  globalDocClient = null;
}