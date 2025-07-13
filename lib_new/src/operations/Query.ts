import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { QueryInput } from '@aws-sdk/client-dynamodb';
import { Schema } from '../core/Schema.js';
import { Item } from '../core/Item.js';
import { 
  QueryResult, 
  QueryCondition, 
  FilterCondition, 
  ConditionOperator, 
  Callback 
} from '../types/dynogels.js';

export class Query<T> {
  private conditions: QueryCondition[] = [];
  private filters: FilterCondition[] = [];
  private indexName?: string;
  private projectionExpression?: string;
  private scanIndexForward: boolean = true;
  private limitValue?: number;
  private startKey?: Record<string, any>;
  private consistentRead?: boolean;
  private selectType?: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'SPECIFIC_ATTRIBUTES' | 'COUNT';
  private filterExpressionValue?: string;
  private expressionAttributeNamesValue?: Record<string, string>;
  private expressionAttributeValuesValue?: Record<string, any>;
  
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>,
    private hashKeyValue: any
  ) {}
  
  /**
   * Add a range key condition
   */
  where<K extends keyof T>(field: K): QueryConditionBuilder<T[K]> {
    return new QueryConditionBuilder(field as string, this);
  }
  
  /**
   * Add a filter condition
   */
  filter<K extends keyof T>(field: K): FilterConditionBuilder<T[K]> {
    return new FilterConditionBuilder(field as string, this);
  }
  
  /**
   * Specify an index to query
   */
  usingIndex(indexName: string): this {
    this.indexName = indexName;
    return this;
  }
  
  /**
   * Specify which attributes to return
   */
  attributes<K extends keyof T>(attrs: K[]): this {
    this.projectionExpression = (attrs as string[]).join(', ');
    this.selectType = 'SPECIFIC_ATTRIBUTES';
    return this;
  }
  
  /**
   * Limit the number of items returned
   */
  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }
  
  /**
   * Sort in ascending order
   */
  ascending(): this {
    this.scanIndexForward = true;
    return this;
  }
  
  /**
   * Sort in descending order
   */
  descending(): this {
    this.scanIndexForward = false;
    return this;
  }
  
  /**
   * Set the start key for pagination
   */
  startKey(key: Record<string, any>): this {
    this.startKey = key;
    return this;
  }
  
  /**
   * Enable consistent read
   */
  consistentRead(enabled: boolean = true): this {
    this.consistentRead = enabled;
    return this;
  }
  
  /**
   * Set select type
   */
  select(type: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'COUNT'): this {
    this.selectType = type;
    return this;
  }
  
  /**
   * Add custom filter expression
   */
  filterExpression(expression: string): this {
    this.filterExpressionValue = expression;
    return this;
  }
  
  /**
   * Add expression attribute names
   */
  expressionAttributeNames(names: Record<string, string>): this {
    this.expressionAttributeNamesValue = names;
    return this;
  }
  
  /**
   * Add expression attribute values
   */
  expressionAttributeValues(values: Record<string, any>): this {
    this.expressionAttributeValuesValue = values;
    return this;
  }
  
  /**
   * Execute the query
   */
  async exec(callback?: Callback<QueryResult<Item<T>>>): Promise<QueryResult<Item<T>>> {
    try {
      const params = this.buildQueryParams();
      const result = await this.docClient.query(params);
      
      const items = (result.Items || []).map(item => {
        const validatedItem = this.schema.validate(item);
        if (!validatedItem.success) {
          throw new Error(`Invalid item data: ${validatedItem.error.message}`);
        }
        return new Item(validatedItem.data, this.getTable());
      });
      
      const queryResult: QueryResult<Item<T>> = {
        Items: items,
        Count: result.Count || 0,
        ScannedCount: result.ScannedCount || 0,
        LastEvaluatedKey: result.LastEvaluatedKey,
        ConsumedCapacity: result.ConsumedCapacity,
      };
      
      if (callback) {
        callback(null, queryResult);
      }
      
      return queryResult;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Add a query condition (internal method)
   */
  addCondition(field: string, operator: ConditionOperator, value?: any): this {
    this.conditions.push({ field, operator, value });
    return this;
  }
  
  /**
   * Add a filter condition (internal method)
   */
  addFilter(field: string, operator: ConditionOperator, value?: any): this {
    this.filters.push({ field, operator, value });
    return this;
  }
  
  /**
   * Build the DynamoDB query parameters
   */
  private buildQueryParams(): any {
    const hashKey = this.schema.getHashKey() as string;
    
    // Build key condition expression
    let keyConditionExpression = `#${hashKey} = :${hashKey}`;
    const expressionAttributeNames: Record<string, string> = {
      [`#${hashKey}`]: hashKey
    };
    const expressionAttributeValues: Record<string, any> = {
      [`:${hashKey}`]: this.hashKeyValue
    };
    
    // Add range key conditions
    this.conditions.forEach((condition, index) => {
      const placeholder = `cond${index}`;
      expressionAttributeNames[`#${placeholder}`] = condition.field;
      
      switch (condition.operator) {
        case 'EQ':
          keyConditionExpression += ` AND #${placeholder} = :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'LT':
          keyConditionExpression += ` AND #${placeholder} < :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'LE':
          keyConditionExpression += ` AND #${placeholder} <= :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'GT':
          keyConditionExpression += ` AND #${placeholder} > :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'GE':
          keyConditionExpression += ` AND #${placeholder} >= :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'BEGINS_WITH':
          keyConditionExpression += ` AND begins_with(#${placeholder}, :${placeholder})`;
          expressionAttributeValues[`:${placeholder}`] = condition.value;
          break;
        case 'BETWEEN':
          keyConditionExpression += ` AND #${placeholder} BETWEEN :${placeholder}_start AND :${placeholder}_end`;
          expressionAttributeValues[`:${placeholder}_start`] = condition.value[0];
          expressionAttributeValues[`:${placeholder}_end`] = condition.value[1];
          break;
      }
    });
    
    // Build filter expression
    let filterExpression = this.filterExpressionValue || '';
    this.filters.forEach((filter, index) => {
      const placeholder = `filter${index}`;
      expressionAttributeNames[`#${placeholder}`] = filter.field;
      
      let filterCondition = '';
      switch (filter.operator) {
        case 'EQ':
          filterCondition = `#${placeholder} = :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'NE':
          filterCondition = `#${placeholder} <> :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'LT':
          filterCondition = `#${placeholder} < :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'LE':
          filterCondition = `#${placeholder} <= :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'GT':
          filterCondition = `#${placeholder} > :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'GE':
          filterCondition = `#${placeholder} >= :${placeholder}`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'CONTAINS':
          filterCondition = `contains(#${placeholder}, :${placeholder})`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'NOT_CONTAINS':
          filterCondition = `NOT contains(#${placeholder}, :${placeholder})`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'BEGINS_WITH':
          filterCondition = `begins_with(#${placeholder}, :${placeholder})`;
          expressionAttributeValues[`:${placeholder}`] = filter.value;
          break;
        case 'IN':
          const inValues = filter.value.map((_: any, i: number) => `:${placeholder}_${i}`);
          filterCondition = `#${placeholder} IN (${inValues.join(', ')})`;
          filter.value.forEach((val: any, i: number) => {
            expressionAttributeValues[`:${placeholder}_${i}`] = val;
          });
          break;
        case 'BETWEEN':
          filterCondition = `#${placeholder} BETWEEN :${placeholder}_start AND :${placeholder}_end`;
          expressionAttributeValues[`:${placeholder}_start`] = filter.value[0];
          expressionAttributeValues[`:${placeholder}_end`] = filter.value[1];
          break;
        case 'NULL':
          filterCondition = `attribute_not_exists(#${placeholder})`;
          break;
        case 'NOT_NULL':
          filterCondition = `attribute_exists(#${placeholder})`;
          break;
      }
      
      if (filterExpression) {
        filterExpression += ` AND ${filterCondition}`;
      } else {
        filterExpression = filterCondition;
      }
    });
    
    const params: any = {
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: {
        ...expressionAttributeNames,
        ...this.expressionAttributeNamesValue
      },
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ...this.expressionAttributeValuesValue
      }
    };
    
    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }
    
    if (this.indexName) {
      params.IndexName = this.indexName;
    }
    
    if (this.projectionExpression) {
      params.ProjectionExpression = this.projectionExpression;
    }
    
    if (this.limitValue) {
      params.Limit = this.limitValue;
    }
    
    if (this.startKey) {
      params.ExclusiveStartKey = this.startKey;
    }
    
    if (this.consistentRead) {
      params.ConsistentRead = this.consistentRead;
    }
    
    if (this.selectType) {
      params.Select = this.selectType;
    }
    
    params.ScanIndexForward = this.scanIndexForward;
    
    return params;
  }
  
  /**
   * Get table reference (temporary hack until we fix circular dependencies)
   */
  private getTable(): any {
    return null; // Will be fixed when we implement the full model
  }
}

export class QueryConditionBuilder<T> {
  constructor(
    private field: string,
    private query: Query<any>
  ) {}
  
  equals(value: T): Query<any> {
    this.query.addCondition(this.field, 'EQ', value);
    return this.query;
  }
  
  lt(value: T): Query<any> {
    this.query.addCondition(this.field, 'LT', value);
    return this.query;
  }
  
  le(value: T): Query<any> {
    this.query.addCondition(this.field, 'LE', value);
    return this.query;
  }
  
  gt(value: T): Query<any> {
    this.query.addCondition(this.field, 'GT', value);
    return this.query;
  }
  
  ge(value: T): Query<any> {
    this.query.addCondition(this.field, 'GE', value);
    return this.query;
  }
  
  beginsWith(value: string): Query<any> {
    this.query.addCondition(this.field, 'BEGINS_WITH', value);
    return this.query;
  }
  
  between(start: T, end: T): Query<any> {
    this.query.addCondition(this.field, 'BETWEEN', [start, end]);
    return this.query;
  }
}

export class FilterConditionBuilder<T> {
  constructor(
    private field: string,
    private query: Query<any>
  ) {}
  
  equals(value: T): Query<any> {
    this.query.addFilter(this.field, 'EQ', value);
    return this.query;
  }
  
  ne(value: T): Query<any> {
    this.query.addFilter(this.field, 'NE', value);
    return this.query;
  }
  
  lt(value: T): Query<any> {
    this.query.addFilter(this.field, 'LT', value);
    return this.query;
  }
  
  le(value: T): Query<any> {
    this.query.addFilter(this.field, 'LE', value);
    return this.query;
  }
  
  gt(value: T): Query<any> {
    this.query.addFilter(this.field, 'GT', value);
    return this.query;
  }
  
  ge(value: T): Query<any> {
    this.query.addFilter(this.field, 'GE', value);
    return this.query;
  }
  
  contains(value: T): Query<any> {
    this.query.addFilter(this.field, 'CONTAINS', value);
    return this.query;
  }
  
  notContains(value: T): Query<any> {
    this.query.addFilter(this.field, 'NOT_CONTAINS', value);
    return this.query;
  }
  
  beginsWith(value: string): Query<any> {
    this.query.addFilter(this.field, 'BEGINS_WITH', value);
    return this.query;
  }
  
  in(values: T[]): Query<any> {
    this.query.addFilter(this.field, 'IN', values);
    return this.query;
  }
  
  between(start: T, end: T): Query<any> {
    this.query.addFilter(this.field, 'BETWEEN', [start, end]);
    return this.query;
  }
  
  null(): Query<any> {
    this.query.addFilter(this.field, 'NULL');
    return this.query;
  }
  
  notNull(): Query<any> {
    this.query.addFilter(this.field, 'NOT_NULL');
    return this.query;
  }
}