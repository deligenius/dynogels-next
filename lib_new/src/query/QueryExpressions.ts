import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import type { ConditionExpression, DynamoDBExpression } from '../types/Query.js';

type ComparisonOperator = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | '<>';
type StringOperator = 'beginsWith' | 'contains' | 'notContains' | 'begins_with' | 'not contains';
type ArrayOperator = 'in' | 'between';
type ExistenceOperator = 'exists' | 'notExists' | 'attribute_exists' | 'attribute_not_exists';

export type QueryOperator = ComparisonOperator | StringOperator | ArrayOperator | ExistenceOperator;

type OperatorValueMap = {
  '=': NativeAttributeValue;
  '!=': NativeAttributeValue;
  'ne': NativeAttributeValue;
  '<': string | number;
  '<=': string | number;
  'lte': string | number;
  '>': string | number;
  '>=': string | number;
  'gte': string | number;
  'lt': string | number;
  'gt': string | number;
  '<>': NativeAttributeValue;
  'beginsWith': string;
  'contains': string;
  'notContains': string;
  'begins_with': string;
  'not contains': string;
  'in': NativeAttributeValue[];
  'between': [NativeAttributeValue, NativeAttributeValue];
  'exists': undefined;
  'notExists': undefined;
  'attribute_exists': undefined;
  'attribute_not_exists': undefined;
};

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class QueryExpressions {

  static buildExpression(conditions: ConditionExpression[]): DynamoDBExpression {
    if (conditions.length === 0) {
      return {
        expression: '',
        attributeNames: {},
        attributeValues: {}
      };
    }

    const expressions = conditions.map(c => `(${c.expression})`);
    return {
      expression: expressions.join(' AND '),
      attributeNames: QueryExpressions.mergeAttributeNames(conditions),
      attributeValues: QueryExpressions.mergeAttributeValues(conditions)
    };
  }

  static createCondition<T extends QueryOperator>(
    key: string,
    operator: T,
    value: OperatorValueMap[T],
    existingValueKeys: string[] = []
  ): ConditionExpression {
    const haskKey = `#${key}` as const;
    /** ":value_0" */
    const colonValue = QueryExpressions.generateUniqueValueKey(key, existingValueKeys);

    switch (operator.toLowerCase()) {
      case '=':
      case 'equals':
        return {
          expression: `${haskKey} = ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case '<>':
      case 'ne':
        return {
          expression: `${haskKey} <> ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case '<':
      case 'lt':
        return {
          expression: `${haskKey} < ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case '<=':
      case 'lte':
        return {
          expression: `${haskKey} <= ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case '>':
      case 'gt':
        return {
          expression: `${haskKey} > ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case '>=':
      case 'gte':
        return {
          expression: `${haskKey} >= ${colonValue}`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('BETWEEN operator requires an array with exactly 2 values');
        }
        // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
        const [min, max] = value as [any, any];
        // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
        const attributeValue1 = QueryExpressions.generateUniqueValueKey(`${key}_min`, existingValueKeys);
        // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
        const attributeValue2 = QueryExpressions.generateUniqueValueKey(`${key}_max`, existingValueKeys);
        return {
          expression: `${haskKey} BETWEEN ${attributeValue1} AND ${attributeValue2}`,
          attributeNames: { [haskKey]: key },
          attributeValues: {
            [attributeValue1]: QueryExpressions.formatValue(min),
            [attributeValue2]: QueryExpressions.formatValue(max)
          }
        };

      case 'begins_with':
      case 'beginswith':
        return {
          expression: `begins_with(${haskKey}, ${colonValue})`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case 'contains':
        return {
          expression: `contains(${haskKey}, ${colonValue})`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case 'not contains':
      case 'notcontains':
        return {
          expression: `NOT contains(${haskKey}, ${colonValue})`,
          attributeNames: { [haskKey]: key },
          attributeValues: { [colonValue]: QueryExpressions.formatValue(value) }
        };

      case 'in':
        if (!Array.isArray(value)) {
          throw new Error('IN operator requires an array of values');
        }
        // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
        const valueKeys = value.map((_: any, index: number) =>
          QueryExpressions.generateUniqueValueKey(`${key}_${index}`, existingValueKeys)
        );
        // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
        const attributeValues: Record<string, NativeAttributeValue> = {};
        valueKeys.forEach((key: string, index: number) => {
          attributeValues[key] = QueryExpressions.formatValue(value[index]);
        });
        return {
          expression: `${haskKey} IN (${valueKeys.join(', ')})`,
          attributeNames: { [haskKey]: key },
          attributeValues
        };

      case 'attribute_exists':
      case 'exists':
        return {
          expression: `attribute_exists(${haskKey})`,
          attributeNames: { [haskKey]: key },
          attributeValues: {}
        };

      case 'attribute_not_exists':
      case 'notexists':
        return {
          expression: `attribute_not_exists(${haskKey})`,
          attributeNames: { [haskKey]: key },
          attributeValues: {}
        };

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  private static mergeAttributeNames(conditions: ConditionExpression[]): Record<string, string> {
    let merged: Record<string, string> = {};
    for (const condition of conditions) {
      merged = { ...merged, ...condition.attributeNames }
    }
    return merged;
  }

  private static mergeAttributeValues(conditions: ConditionExpression[]): Record<string, NativeAttributeValue> {
    let merged: Record<string, NativeAttributeValue> = {};
    for (const condition of conditions) {
      merged = { ...merged, ...condition.attributeValues }
    }
    return merged;
  }

  /**
   * Generates a unique value key for a given base name and existing keys.
   * @example
   * const existingKeys = [':key1', ':key2', ':key3'];
   * const baseName = 'value';
   * const uniqueKey = QueryExpressions.generateUniqueValueKey(baseName, existingKeys);
   * // Returns ':value_0'
   * 
   * @example
   * const existingKeys = [':value_0', ':value_1', ':value_2'];
   * const baseName = 'value';
   * const uniqueKey = QueryExpressions.generateUniqueValueKey(baseName, existingKeys);
   * // Returns ':value_3'
   */
  private static generateUniqueValueKey(baseName: string, existingKeys: string[]): string {
    let counter = 0;
    let candidateKey = `:${baseName}`;

    while (existingKeys.includes(candidateKey)) {
      candidateKey = `:${baseName}_${counter}`;
      counter++;
    }

    return candidateKey;
  }

  private static formatValue(value: NativeAttributeValue): NativeAttributeValue {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  static getExistingValueKeys(expressions: DynamoDBExpression[]): string[] {
    const keys: string[] = [];
    for (const expr of expressions) {
      keys.push(...Object.keys(expr.attributeValues));
    }
    return keys;
  }
}