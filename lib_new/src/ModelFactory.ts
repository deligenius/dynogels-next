import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import type { z } from 'zod';
import { Model } from './Model.js';
import type { ModelConfig } from './types/Model.js';

export class ModelFactory {
  private readonly documentClient: DynamoDBDocument;

  constructor(private readonly client: DynamoDBClient) {
    this.documentClient = DynamoDBDocument.from(client);
  }

  defineModel<TSchema extends z.ZodObject<any>, THashKey extends keyof z.infer<TSchema>, TRangeKey extends keyof z.infer<TSchema> | undefined = undefined>(
    config: ModelConfig<TSchema> & {
      hashKey: THashKey;
      rangeKey?: TRangeKey;
    }
  ): Model<TSchema, THashKey, TRangeKey> {
    return new Model(this.documentClient, config);
  }
}