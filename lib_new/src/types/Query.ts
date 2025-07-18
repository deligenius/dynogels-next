import type { z } from 'zod';

export interface QueryOptions {
  consistentRead?: boolean;
  limit?: number;
  scanIndexForward?: boolean;
  exclusiveStartKey?: Record<string, any>;
}

export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
  scannedCount: number;
  consumedCapacity?: any;
}

export interface IndexConfig {
  name: string;
  hashKey: string;
  rangeKey?: string;
}

export interface ConditionExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, any>;
}

export interface DynamoDBExpression {
  expression: string;
  attributeNames: Record<string, string>;
  attributeValues: Record<string, any>;
}

export type SchemaKeys<T extends z.ZodObject<any>> = keyof z.infer<T>;

export interface StringOperators<TBuilder> {
  equals(value: string): TBuilder;
  eq(value: string): TBuilder;
  ne(value: string): TBuilder;
  lt(value: string): TBuilder;
  lte(value: string): TBuilder;
  gt(value: string): TBuilder;
  gte(value: string): TBuilder;
  beginsWith(prefix: string): TBuilder;
  contains(substring: string): TBuilder;
  notContains(substring: string): TBuilder;
  between(min: string, max: string): TBuilder;
  in(values: string[]): TBuilder;
}

export interface NumberOperators<TBuilder> {
  equals(value: number): TBuilder;
  eq(value: number): TBuilder;
  ne(value: number): TBuilder;
  lt(value: number): TBuilder;
  lte(value: number): TBuilder;
  gt(value: number): TBuilder;
  gte(value: number): TBuilder;
  between(min: number, max: number): TBuilder;
  in(values: number[]): TBuilder;
}

export interface BooleanOperators<TBuilder> {
  equals(value: boolean): TBuilder;
  eq(value: boolean): TBuilder;
  ne(value: boolean): TBuilder;
}

export interface BaseOperators<TBuilder> {
  equals(value: any): TBuilder;
  eq(value: any): TBuilder;
  ne(value: any): TBuilder;
  exists(): TBuilder;
  notExists(): TBuilder;
  in(values: any[]): TBuilder;
}

export type ConditionOperators<T, TBuilder> = T extends string
  ? StringOperators<TBuilder>
  : T extends number
  ? NumberOperators<TBuilder>
  : T extends boolean
  ? BooleanOperators<TBuilder>
  : BaseOperators<TBuilder>;

export interface FilterOperators<T, TBuilder> extends ConditionOperators<T, TBuilder> {
  exists(): TBuilder;
  notExists(): TBuilder;
}