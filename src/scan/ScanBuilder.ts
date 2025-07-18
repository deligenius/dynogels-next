import type { DynamoDBDocument, NativeAttributeValue, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import type { z } from 'zod';
import type { ModelConfig } from '../types/Model.js';
import type { SchemaKeys } from '../types/Query.js';
import { FilterConditions, StringFilterConditions } from './ScanConditions.js';

export class ScanBuilder<
  TSchema extends z.ZodObject<any>,
  TConfig extends ModelConfig<TSchema> = ModelConfig<TSchema>
> {
  private filterConditions: ConditionExpression[] = [];
  private options: ScanOptions = {};
  private indexName?: string;
  private isLoadAll = false;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: TConfig
  ) {}

  filter<TField extends SchemaKeys<TSchema>>(fieldName: TField): any {
    const existingKeys = this.getExistingValueKeys();
    const addCondition = (condition: ConditionExpression) => {
      this.filterConditions.push(condition);
      return this;
    };

    if (this.isStringField(fieldName)) {
      return new StringFilterConditions(String(fieldName), addCondition, existingKeys);
    }

    return new FilterConditions(String(fieldName), addCondition, existingKeys);
  }

  private buildRequest(): ScanCommandInput {
    const request: ScanCommandInput = {
      TableName: this.config.tableName
    };

    if (this.indexName) {
      request.IndexName = this.indexName;
    }

    return request;
  }

  async exec(): Promise<z.infer<TSchema>[]> {
    const request = this.buildRequest();
    const response = await this.client.scan(request);
    return (response.Items || []).map(item => this.validateAndTransform(item));
  }

  private validateAndTransform(item: any): z.infer<TSchema> {
    return this.config.schema.parse(item);
  }

  private isStringField(fieldName: SchemaKeys<TSchema>): boolean {
    // Implementation to be added
    return false;
  }

  private getExistingValueKeys(): string[] {
    // Implementation to be added
    return [];
  }
}

interface ScanOptions extends Pick<ScanCommandInput, 
  'ConsistentRead' | 'Limit' | 'ProjectionExpression' | 'ReturnConsumedCapacity' | 
  'Segment' | 'TotalSegments'
> {
  ExclusiveStartKey?: Record<string, NativeAttributeValue>;
}

interface ConditionExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, NativeAttributeValue>;
}