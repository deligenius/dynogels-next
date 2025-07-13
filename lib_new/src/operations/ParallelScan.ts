import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Schema } from '../core/Schema.js';
import { Item } from '../core/Item.js';
import { Scan } from './Scan.js';
import { 
  ScanResult, 
  Callback 
} from '../types/dynogels.js';

export class ParallelScan<T> {
  private totalSegments: number;
  private scans: Scan<T>[] = [];
  
  constructor(
    private docClient: DynamoDBDocument,
    private tableName: string,
    private schema: Schema<any>,
    segments: number
  ) {
    this.totalSegments = segments;
    
    // Create a scan for each segment
    for (let i = 0; i < segments; i++) {
      const scan = new Scan<T>(docClient, tableName, schema);
      scan.segment(i, segments);
      this.scans.push(scan);
    }
  }
  
  /**
   * Add a filter condition to all scans
   */
  where<K extends keyof T>(field: K): ParallelScanFilterBuilder<T[K]> {
    return new ParallelScanFilterBuilder(field as string, this);
  }
  
  /**
   * Specify which attributes to return
   */
  attributes<K extends keyof T>(attrs: K[]): this {
    this.scans.forEach(scan => scan.attributes(attrs));
    return this;
  }
  
  /**
   * Limit the number of items returned per segment
   */
  limit(limit: number): this {
    this.scans.forEach(scan => scan.limit(limit));
    return this;
  }
  
  /**
   * Enable consistent read
   */
  consistentRead(enabled: boolean = true): this {
    this.scans.forEach(scan => scan.consistentRead(enabled));
    return this;
  }
  
  /**
   * Set select type
   */
  select(type: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'COUNT'): this {
    this.scans.forEach(scan => scan.select(type));
    return this;
  }
  
  /**
   * Add custom filter expression
   */
  filterExpression(expression: string): this {
    this.scans.forEach(scan => scan.filterExpression(expression));
    return this;
  }
  
  /**
   * Add expression attribute names
   */
  expressionAttributeNames(names: Record<string, string>): this {
    this.scans.forEach(scan => scan.expressionAttributeNames(names));
    return this;
  }
  
  /**
   * Add expression attribute values
   */
  expressionAttributeValues(values: Record<string, any>): this {
    this.scans.forEach(scan => scan.expressionAttributeValues(values));
    return this;
  }
  
  /**
   * Execute all scans in parallel
   */
  async exec(callback?: Callback<ScanResult<Item<T>>>): Promise<ScanResult<Item<T>>> {
    try {
      // Execute all scans in parallel
      const promises = this.scans.map(scan => scan.exec());
      const results = await Promise.all(promises);
      
      // Merge all results
      const allItems: Item<T>[] = [];
      let totalCount = 0;
      let totalScannedCount = 0;
      let lastEvaluatedKey: Record<string, any> | undefined;
      
      for (const result of results) {
        allItems.push(...result.Items);
        totalCount += result.Count;
        totalScannedCount += result.ScannedCount;
        
        // Use the last evaluated key from any segment that has one
        if (result.LastEvaluatedKey) {
          lastEvaluatedKey = result.LastEvaluatedKey;
        }
      }
      
      const combinedResult: ScanResult<Item<T>> = {
        Items: allItems,
        Count: totalCount,
        ScannedCount: totalScannedCount,
        LastEvaluatedKey: lastEvaluatedKey,
      };
      
      if (callback) {
        callback(null, combinedResult);
      }
      
      return combinedResult;
      
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Add a filter condition to all scans (internal method)
   */
  addFilter(field: string, operator: any, value?: any): this {
    this.scans.forEach(scan => scan.addFilter(field, operator, value));
    return this;
  }
}

export class ParallelScanFilterBuilder<T> {
  constructor(
    private field: string,
    private parallelScan: ParallelScan<any>
  ) {}
  
  equals(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'EQ', value);
    return this.parallelScan;
  }
  
  ne(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'NE', value);
    return this.parallelScan;
  }
  
  lt(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'LT', value);
    return this.parallelScan;
  }
  
  le(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'LE', value);
    return this.parallelScan;
  }
  
  gt(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'GT', value);
    return this.parallelScan;
  }
  
  ge(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'GE', value);
    return this.parallelScan;
  }
  
  contains(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'CONTAINS', value);
    return this.parallelScan;
  }
  
  notContains(value: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'NOT_CONTAINS', value);
    return this.parallelScan;
  }
  
  beginsWith(value: string): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'BEGINS_WITH', value);
    return this.parallelScan;
  }
  
  in(values: T[]): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'IN', values);
    return this.parallelScan;
  }
  
  between(start: T, end: T): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'BETWEEN', [start, end]);
    return this.parallelScan;
  }
  
  null(): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'NULL');
    return this.parallelScan;
  }
  
  notNull(): ParallelScan<any> {
    this.parallelScan.addFilter(this.field, 'NOT_NULL');
    return this.parallelScan;
  }
}