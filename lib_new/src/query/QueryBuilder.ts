import type { DynamoDBDocument, NativeAttributeValue, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { ModelConfig } from '../types/Model.js';
import type {
  ConditionExpression,
  QueryOptions,
  QueryResult,
  SchemaKeys
} from '../types/Query.js';
import {
  FilterConditions,
  QueryConditions,
  StringFilterConditions,
  StringQueryConditions
} from './QueryConditions.js';
import { QueryExpressions } from './QueryExpressions.js';

export class QueryBuilder<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined = undefined
> {
  private keyConditions: ConditionExpression[] = [];
  private filterConditions: ConditionExpression[] = [];
  private options: QueryOptions = {};
  private indexName?: string;
  private isLoadAll = false;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly config: ModelConfig<TSchema> & {
      hashKey: THashKey;
      rangeKey?: TRangeKey;
    },
    private readonly keyValues: Partial<z.infer<TSchema>>
  ) { }

  where<TField extends SchemaKeys<TSchema>>(
    fieldName: TField
  ): z.infer<TSchema>[TField] extends string
    ? StringQueryConditions<TSchema, TField, QueryBuilder<TSchema, THashKey, TRangeKey>>
    : QueryConditions<TSchema, TField, QueryBuilder<TSchema, THashKey, TRangeKey>> {

    const existingKeys = this.getExistingValueKeys();
    const addCondition = (condition: ConditionExpression) => {
      this.keyConditions.push(condition);
      return this;
    };

    if (this.isStringField(fieldName)) {
      return new StringQueryConditions(
        String(fieldName),
        addCondition,
        existingKeys
      ) as any;
    }

    return new QueryConditions(
      String(fieldName),
      addCondition,
      existingKeys
    ) as any;
  }

  filter<TField extends SchemaKeys<TSchema>>(
    fieldName: TField
  ): z.infer<TSchema>[TField] extends string
    ? StringFilterConditions<TSchema, TField, QueryBuilder<TSchema, THashKey, TRangeKey>>
    : FilterConditions<TSchema, TField, QueryBuilder<TSchema, THashKey, TRangeKey>> {

    const existingKeys = this.getExistingValueKeys();
    const addCondition = (condition: ConditionExpression) => {
      this.filterConditions.push(condition);
      return this;
    };

    if (this.isStringField(fieldName)) {
      return new StringFilterConditions(
        String(fieldName),
        addCondition,
        existingKeys
      ) as any;
    }

    return new FilterConditions(
      String(fieldName),
      addCondition,
      existingKeys
    ) as any;
  }

  usingIndex(indexName: string): this {
    this.indexName = indexName;
    return this;
  }

  consistentRead(enabled = true): this {
    this.options.ConsistentRead = enabled;
    return this;
  }

  limit(count: number): this {
    if (count <= 0) {
      throw new Error('Limit must be greater than 0');
    }
    this.options.Limit = count;
    return this;
  }

  ascending(): this {
    this.options.ScanIndexForward = true;
    return this;
  }

  descending(): this {
    this.options.ScanIndexForward = false;
    return this;
  }

  startKey(key: Record<string, NativeAttributeValue>): this {
    this.options.ExclusiveStartKey = key;
    return this;
  }

  projectionExpression(expression: string): this {
    this.options.ProjectionExpression = expression;
    return this;
  }

  returnConsumedCapacity(level: 'INDEXES' | 'TOTAL' | 'NONE' = 'NONE'): this {
    this.options.ReturnConsumedCapacity = level;
    return this;
  }

  loadAll(): this {
    this.isLoadAll = true;
    return this;
  }

  async exec(): Promise<z.infer<TSchema>[]> {
    if (this.isLoadAll) {
      return this.execLoadAll();
    }

    const result = await this.execWithPagination();
    return result.items;
  }

  async execWithPagination(lastEvaluatedKey?: Record<string, any>): Promise<QueryResult<z.infer<TSchema>>> {
    const request = this.buildRequest();

    if (lastEvaluatedKey) {
      request.ExclusiveStartKey = lastEvaluatedKey;
    }

    try {
      const response = await this.client.query(request);

      const items = (response.Items || []).map(item =>
        this.validateAndTransform(item)
      );

      return {
        items,
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount || 0,
        consumedCapacity: response.ConsumedCapacity
      };
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *stream(): AsyncIterableIterator<z.infer<TSchema>[]> {
    let lastEvaluatedKey = this.options.ExclusiveStartKey;

    do {
      const result = await this.execWithPagination(lastEvaluatedKey);

      yield result.items;

      lastEvaluatedKey = result.lastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  private async execLoadAll(): Promise<z.infer<TSchema>[]> {
    const allItems: z.infer<TSchema>[] = [];

    for await (const item of this.stream()) {
      allItems.push(item);
    }

    return allItems;
  }

  private buildRequest(): QueryCommandInput {
    // Start with properly typed base request
    const request: QueryCommandInput = {
      TableName: this.config.tableName
    };

    // Apply options with proper property names
    if (this.options.ConsistentRead !== undefined) {
      request.ConsistentRead = this.options.ConsistentRead;
    }
    if (this.options.Limit !== undefined) {
      request.Limit = this.options.Limit;
    }
    if (this.options.ScanIndexForward !== undefined) {
      request.ScanIndexForward = this.options.ScanIndexForward;
    }
    if (this.options.ExclusiveStartKey !== undefined) {
      request.ExclusiveStartKey = this.options.ExclusiveStartKey;
    }
    if (this.options.ProjectionExpression !== undefined) {
      request.ProjectionExpression = this.options.ProjectionExpression;
    }
    if (this.options.ReturnConsumedCapacity !== undefined) {
      request.ReturnConsumedCapacity = this.options.ReturnConsumedCapacity;
    }

    if (this.indexName) {
      request.IndexName = this.indexName;
    }

    // Build key conditions directly from keyValues
    const keyConditions = this.buildKeyConditions();
    const allKeyConditions = [...keyConditions, ...this.keyConditions];

    const keyConditionExpression = QueryExpressions.buildExpression(allKeyConditions);

    //*Step 1: create key condition expression
    if (keyConditionExpression.expression) {
      request.KeyConditionExpression = keyConditionExpression.expression;

      if (Object.keys(keyConditionExpression.attributeNames).length > 0) {
        request.ExpressionAttributeNames = keyConditionExpression.attributeNames;
      }

      if (Object.keys(keyConditionExpression.attributeValues).length > 0) {
        request.ExpressionAttributeValues = keyConditionExpression.attributeValues;
      }
    }

    //*Step 2: create filter expression
    if (this.filterConditions.length > 0) {
      const filterExpression = QueryExpressions.buildExpression(this.filterConditions);
      if (filterExpression.expression) {
        request.FilterExpression = filterExpression.expression;

        if (Object.keys(filterExpression.attributeNames).length > 0) {
          request.ExpressionAttributeNames = {
            ...request.ExpressionAttributeNames,
            ...filterExpression.attributeNames
          };
        }

        if (Object.keys(filterExpression.attributeValues).length > 0) {
          request.ExpressionAttributeValues = {
            ...request.ExpressionAttributeValues,
            ...filterExpression.attributeValues
          };
        }
      }
    }

    return request;
  }

  private buildKeyConditions(): ConditionExpression[] {
    const conditions: ConditionExpression[] = [];
    const existingKeys = this.getExistingValueKeys();

    // Generate eq conditions for all provided key values
    for (const [fieldName, value] of Object.entries(this.keyValues)) {
      if (value !== undefined) {
        conditions.push(QueryExpressions.createCondition(
          fieldName,
          '=',
          value as NativeAttributeValue,
          existingKeys
        ));
      }
    }

    return conditions;
  }


  /**
   * Returns all currently used value keys from both key conditions and filter expressions.
   * 
   * This method extracts all attribute value keys (like `:value_0`, `:name_1`, `:age_between_min`) 
   * that are already in use across all conditions. It's used to avoid conflicts when generating 
   * new unique value keys for additional conditions.
   * 
   * @returns Array of existing value keys used in expressions
   * 
   * @example
   * ```typescript
   * // After building query with conditions:
   * // .query({ id: 'user-1' })           // Uses :id
   * // .filter('name').eq('John')         // Uses :name_0  
   * // .filter('age').between(18, 65)     // Uses :age_between_min, :age_between_max
   * 
   * const existingKeys = this.getExistingValueKeys();
   * // Returns: [':id', ':name_0', ':age_between_min', ':age_between_max']
   * 
   * // Next condition will avoid these keys and use :status_0, :status_1, etc.
   * ```
   */
  private getExistingValueKeys(): string[] {
    const keyExpr = QueryExpressions.buildExpression(this.keyConditions);
    const filterExpr = QueryExpressions.buildExpression(this.filterConditions);

    return [
      ...Object.keys(keyExpr.attributeValues),
      ...Object.keys(filterExpr.attributeValues)
    ];
  }

  private isStringField(fieldName: SchemaKeys<TSchema>): boolean {
    try {
      const schemaShape = this.config.schema.shape as z.ZodObject<any>;
      const field = schemaShape[fieldName as keyof typeof schemaShape];

      if (!field || typeof field._def !== 'object') {
        return false;
      }

      return field._def.typeName === 'ZodString';
    } catch {
      return false;
    }
  }

  private validateAndTransform(item: any): z.infer<TSchema> {
    try {
      return this.config.schema.parse(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Validation failed: ${error.issues.map(i => i.message).join(', ')}`
        );
      }
      throw error;
    }
  }
}