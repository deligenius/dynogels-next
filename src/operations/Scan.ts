import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Schema } from '../core/Schema.js';
import { Item } from '../core/Item.js';
import { 
  ScanResult, 
  FilterCondition, 
  ConditionOperator, 
  Callback 
} from '../types/dynogels.js';

export class Scan<T> {
  private filters: FilterCondition[] = [];
  private projectionExpression?: string;
  private limitValue?: number;
  private startKeyValue?: Record<string, any>;
  private consistentReadValue?: boolean;
  private selectType?: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'SPECIFIC_ATTRIBUTES' | 'COUNT';
  private filterExpressionValue?: string;
  private expressionAttributeNamesValue?: Record<string, string>;
  private expressionAttributeValuesValue?: Record<string, any>;
  private segmentValue?: number;
  private totalSegments?: number;
  
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>
  ) {}
  
  /**
   * Add a filter condition
   */
  where<K extends keyof T>(field: K): ScanFilterBuilder<T[K]> {
    return new ScanFilterBuilder(field as string, this);
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
   * Set the start key for pagination
   */
  startKey(key: Record<string, any>): this {
    this.startKeyValue = key;
    return this;
  }
  
  /**
   * Enable consistent read
   */
  consistentRead(enabled: boolean = true): this {
    this.consistentReadValue = enabled;
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
   * Set segment for parallel scanning
   */
  segment(segment: number, totalSegments: number): this {
    this.segmentValue = segment;
    this.totalSegments = totalSegments;
    return this;
  }
  
  /**
   * Execute the scan
   */
  async exec(callback?: Callback<ScanResult<Item<T>>>): Promise<ScanResult<Item<T>>> {
    try {
      const params = this.buildScanParams();
      const result = await this.docClient.scan(params);
      
      const items = (result.Items || []).map(item => {
        const validatedItem = this.schema.validate(item);
        if (!validatedItem.success) {
          throw new Error(`Invalid item data: ${validatedItem.error.message}`);
        }
        return new Item(validatedItem.data, this.getTable());
      });
      
      const scanResult: ScanResult<Item<T>> = {
        Items: items,
        Count: result.Count || 0,
        ScannedCount: result.ScannedCount || 0,
        LastEvaluatedKey: result.LastEvaluatedKey,
        ConsumedCapacity: result.ConsumedCapacity,
      };
      
      if (callback) {
        callback(null, scanResult);
      }
      
      return scanResult;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Add a filter condition (internal method)
   */
  addFilter(field: string, operator: ConditionOperator, value?: any): this {
    this.filters.push({ field, operator, value });
    return this;
  }
  
  /**
   * Build the DynamoDB scan parameters
   */
  private buildScanParams(): any {
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
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
    };
    
    if (Object.keys(expressionAttributeNames).length > 0 || this.expressionAttributeNamesValue) {
      params.ExpressionAttributeNames = {
        ...expressionAttributeNames,
        ...this.expressionAttributeNamesValue
      };
    }
    
    if (Object.keys(expressionAttributeValues).length > 0 || this.expressionAttributeValuesValue) {
      params.ExpressionAttributeValues = {
        ...expressionAttributeValues,
        ...this.expressionAttributeValuesValue
      };
    }
    
    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }
    
    if (this.projectionExpression) {
      params.ProjectionExpression = this.projectionExpression;
    }
    
    if (this.limitValue) {
      params.Limit = this.limitValue;
    }
    
    if (this.startKeyValue) {
      params.ExclusiveStartKey = this.startKeyValue;
    }
    
    if (this.consistentReadValue) {
      params.ConsistentRead = this.consistentReadValue;
    }
    
    if (this.selectType) {
      params.Select = this.selectType;
    }
    
    if (this.segmentValue !== undefined && this.totalSegments !== undefined) {
      params.Segment = this.segmentValue;
      params.TotalSegments = this.totalSegments;
    }
    
    return params;
  }
  
  /**
   * Get table reference (temporary hack until we fix circular dependencies)
   */
  private getTable(): any {
    return null; // Will be fixed when we implement the full model
  }
}

export class ScanFilterBuilder<T> {
  constructor(
    private field: string,
    private scan: Scan<any>
  ) {}
  
  equals(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'EQ', value);
    return this.scan;
  }
  
  ne(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'NE', value);
    return this.scan;
  }
  
  lt(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'LT', value);
    return this.scan;
  }
  
  le(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'LE', value);
    return this.scan;
  }
  
  gt(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'GT', value);
    return this.scan;
  }
  
  ge(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'GE', value);
    return this.scan;
  }
  
  contains(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'CONTAINS', value);
    return this.scan;
  }
  
  notContains(value: T): Scan<any> {
    this.scan.addFilter(this.field, 'NOT_CONTAINS', value);
    return this.scan;
  }
  
  beginsWith(value: string): Scan<any> {
    this.scan.addFilter(this.field, 'BEGINS_WITH', value);
    return this.scan;
  }
  
  in(values: T[]): Scan<any> {
    this.scan.addFilter(this.field, 'IN', values);
    return this.scan;
  }
  
  between(start: T, end: T): Scan<any> {
    this.scan.addFilter(this.field, 'BETWEEN', [start, end]);
    return this.scan;
  }
  
  null(): Scan<any> {
    this.scan.addFilter(this.field, 'NULL');
    return this.scan;
  }
  
  notNull(): Scan<any> {
    this.scan.addFilter(this.field, 'NOT_NULL');
    return this.scan;
  }
}