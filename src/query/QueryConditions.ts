import type { z } from 'zod';
import type {
  ConditionExpression,
  ConditionOperators,
  FilterOperators,
  SchemaKeys
} from '../types/Query.js';
import { QueryExpressions } from './QueryExpressions.js';

export class QueryConditions<
  TSchema extends z.ZodObject<any>,
  TSchemaType extends z.infer<TSchema>,
  TField extends keyof TSchemaType,
  TBuilder
> {
  constructor(
    protected readonly fieldName: string,
    protected readonly addCondition: (condition: ConditionExpression) => TBuilder,
    protected readonly existingValueKeys: string[] = []
  ) { }

  equals(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '=',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  eq(value: z.infer<TSchema>[TField]): TBuilder {
    return this.equals(value);
  }

  ne(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '<>',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  lt(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '<',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  lte(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '<=',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  gt(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '>',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  gte(value: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      '>=',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  // Convenience aliases
  greaterThan(value: z.infer<TSchema>[TField]): TBuilder {
    return this.gt(value);
  }

  greaterThanOrEqualTo(value: z.infer<TSchema>[TField]): TBuilder {
    return this.gte(value);
  }

  lessThan(value: z.infer<TSchema>[TField]): TBuilder {
    return this.lt(value);
  }

  lessThanOrEqualTo(value: z.infer<TSchema>[TField]): TBuilder {
    return this.lte(value);
  }

  notEqual(value: z.infer<TSchema>[TField]): TBuilder {
    return this.ne(value);
  }

  between(min: z.infer<TSchema>[TField], max: z.infer<TSchema>[TField]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'between',
      [min, max],
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  in(values: z.infer<TSchema>[TField][]): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'in',
      values,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  exists(): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'attribute_exists',
      undefined,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  notExists(): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'attribute_not_exists',
      undefined,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }
}

export class StringQueryConditions<
  TSchema extends z.ZodObject<any>,
  TSchemaType extends z.infer<TSchema>,
  TField extends keyof TSchemaType,
  TBuilder
> extends QueryConditions<TSchema, TSchemaType, TField, TBuilder> {

  beginsWith(prefix: string): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'begins_with',
      prefix,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  contains(substring: string): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'contains',
      substring,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  notContains(substring: string): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'not contains',
      substring,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  constructor(
    fieldName: string,
    addCondition: (condition: ConditionExpression) => TBuilder,
    existingValueKeys: string[] = []
  ) {
    super(fieldName, addCondition, existingValueKeys);
  }
}

export class FilterConditions<
  TSchema extends z.ZodObject<any>,
  TSchemaType extends z.infer<TSchema>,
  TField extends keyof TSchemaType,
  TBuilder
> extends QueryConditions<TSchema, TSchemaType, TField, TBuilder> {

  contains(value: any): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'contains',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  notContains(value: any): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'not contains',
      value,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  constructor(
    fieldName: string,
    addCondition: (condition: ConditionExpression) => TBuilder,
    existingValueKeys: string[] = []
  ) {
    super(fieldName, addCondition, existingValueKeys);
  }
}

export class StringFilterConditions<
  TSchema extends z.ZodObject<any>,
  TSchemaType extends z.infer<TSchema>,
  TField extends keyof TSchemaType,
  TBuilder
> extends FilterConditions<TSchema, TSchemaType, TField, TBuilder> {

  beginsWith(prefix: string): TBuilder {
    const condition = QueryExpressions.createCondition(
      this.fieldName,
      'begins_with',
      prefix,
      this.existingValueKeys
    );
    return this.addCondition(condition);
  }

  constructor(
    fieldName: string,
    addCondition: (condition: ConditionExpression) => TBuilder,
    existingValueKeys: string[] = []
  ) {
    super(fieldName, addCondition, existingValueKeys);
  }
}