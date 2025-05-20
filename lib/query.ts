import _ from 'lodash';
import { buildFilterExpression } from './expressions';
import { QueryBase } from './query-base';
import { paginatedRequest } from './utils';

interface Schema {
  hashKey: string;
  globalIndexes: {
    [key: string]: {
      hashKey: string;
    };
  };
}

interface Table {
  schema: Schema;
  tableName(): string;
  runQuery(params: any, callback: (err: Error | null, data?: any) => void): void;
}

interface Serializer {
  // Add serializer interface properties if needed
}

interface QueryRequest {
  IndexName?: string;
  ConsistentRead?: boolean;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, any>;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  ScanIndexForward?: boolean;
  TableName?: string;
}

interface Condition {
  statement: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, any>;
}

interface QueryOptions {
  loadAll: boolean;
}

class Query extends QueryBase {
  private hashKey: any;
  private table: Table;
  private serializer: Serializer;
  private options: QueryOptions;
  private request: QueryRequest;

  constructor(hashKey: any, table: Table, serializer: Serializer) {
    super();
    this.hashKey = hashKey;
    this.table = table;
    this.serializer = serializer;
    this.options = { loadAll: false };
    this.request = {};
  }

  usingIndex(name: string): this {
    this.request.IndexName = name;
    return this;
  }

  consistentRead(read: boolean = true): this {
    this.request.ConsistentRead = read;
    return this;
  }

  private addExpressionAttributes(condition: Condition): void {
    const expressionAttributeNames = _.merge({}, condition.attributeNames, this.request.ExpressionAttributeNames);
    const expressionAttributeValues = _.merge({}, condition.attributeValues, this.request.ExpressionAttributeValues);

    if (!_.isEmpty(expressionAttributeNames)) {
      this.request.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (!_.isEmpty(expressionAttributeValues)) {
      this.request.ExpressionAttributeValues = expressionAttributeValues;
    }
  }

  addKeyCondition(condition: Condition): this {
    this.addExpressionAttributes(condition);

    if (_.isString(this.request.KeyConditionExpression)) {
      this.request.KeyConditionExpression = `${this.request.KeyConditionExpression} AND (${condition.statement})`;
    } else {
      this.request.KeyConditionExpression = `(${condition.statement})`;
    }

    return this;
  }

  addFilterCondition(condition: Condition): this {
    this.addExpressionAttributes(condition);

    if (_.isString(this.request.FilterExpression)) {
      this.request.FilterExpression = `${this.request.FilterExpression} AND (${condition.statement})`;
    } else {
      this.request.FilterExpression = `(${condition.statement})`;
    }

    return this;
  }

  ascending(): this {
    this.request.ScanIndexForward = true;
    return this;
  }

  descending(): this {
    this.request.ScanIndexForward = false;
    return this;
  }

  where(keyName: string) {
    return this.createKeyCondition(keyName);
  }

  filter(keyName: string) {
    return this.createQueryFilter(keyName);
  }

  exec(callback: (err: Error | null, data?: any) => void) {
    this.addKeyCondition(this.buildKey());

    const runQuery = (params: any, callback: (err: Error | null, data?: any) => void) => {
      this.table.runQuery(params, callback);
    };

    return paginatedRequest(this, runQuery, callback);
  }

  private buildKey(): Condition {
    let key = this.table.schema.hashKey;

    if (this.isUsingGlobalIndex()) {
      key = this.table.schema.globalIndexes[this.request.IndexName!].hashKey;
    }

    const existingValueKeys = _.keys(this.request.ExpressionAttributeValues);
    return buildFilterExpression(key, '=', existingValueKeys, this.hashKey);
  }

  private isUsingGlobalIndex(): boolean {
    return Boolean(this.request.IndexName && this.table.schema.globalIndexes[this.request.IndexName]);
  }

  private createKeyCondition(keyName: string) {
    const createOperator = (operator: string) => (...args: any[]) => {
      const existingValueKeys = _.keys(this.request.ExpressionAttributeValues);
      const condition = buildFilterExpression(keyName, operator, existingValueKeys, ...args);
      return this.addKeyCondition(condition);
    };

    return {
      equals: createOperator('='),
      eq: createOperator('='),
      lte: createOperator('<='),
      lt: createOperator('<'),
      gte: createOperator('>='),
      gt: createOperator('>'),
      beginsWith: createOperator('begins_with'),
      between: createOperator('BETWEEN')
    };
  }

  private createQueryFilter(keyName: string) {
    const createOperator = (operator: string) => (...args: any[]) => {
      const existingValueKeys = _.keys(this.request.ExpressionAttributeValues);
      const condition = buildFilterExpression(keyName, operator, existingValueKeys, ...args);
      return this.addFilterCondition(condition);
    };

    return {
      equals: createOperator('='),
      eq: createOperator('='),
      ne: createOperator('<>'),
      lte: createOperator('<='),
      lt: createOperator('<'),
      gte: createOperator('>='),
      gt: createOperator('>'),
      null: createOperator('attribute_not_exists'),
      exists: createOperator('attribute_exists'),
      contains: createOperator('contains'),
      notContains: createOperator('NOT contains'),
      in: createOperator('IN'),
      beginsWith: createOperator('begins_with'),
      between: createOperator('BETWEEN')
    };
  }

  buildRequest(): QueryRequest {
    return _.merge({}, this.request, { TableName: this.table.tableName() });
  }
}

export { Query, type QueryRequest, type Condition, type Table, type Schema, type Serializer }; 