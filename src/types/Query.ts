import type {
	NativeAttributeValue,
	QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { z } from "zod";

// QueryOptions that map directly to QueryCommandInput properties
export interface QueryOptions
	extends Pick<
		QueryCommandInput,
		| "ConsistentRead"
		| "Limit"
		| "ScanIndexForward"
		| "ProjectionExpression"
		| "ReturnConsumedCapacity"
	> {
	// Use NativeAttributeValue for pagination keys to match AWS SDK
	ExclusiveStartKey?: Record<string, NativeAttributeValue>;
}

// Legacy interface for backward compatibility
export interface LegacyQueryOptions {
	consistentRead?: boolean;
	limit?: number;
	scanIndexForward?: boolean;
	exclusiveStartKey?: Record<string, any>;
}

export interface QueryResult<T> {
	items: T[];
	lastEvaluatedKey?: Record<string, NativeAttributeValue>;
	count: number;
	scannedCount: number;
	consumedCapacity?: any;
}

export interface IndexConfig {
	name: string;
	hashKey: string;
	rangeKey?: string;
}

// Use NativeAttributeValue for type safety with AWS SDK
export interface ConditionExpression {
	expression: string;
	attributeNames: Record<string, string>;
	attributeValues: Record<string, NativeAttributeValue>;
}

/**
 * @example
 * ```typescript
 * const expression: DynamoDBExpression = {
 *   expression: 'attribute_exists(name) AND name = :name',
 *   attributeNames: { '#name': 'name' },
 *   attributeValues: { ':name': 'John' }
 * };
 */
export interface DynamoDBExpression {
	expression: string;
	attributeNames: Record<string, string>;
	attributeValues: Record<string, NativeAttributeValue>;
}

// More explicit type that helps with autocomplete
export type SchemaKeys<T extends z.ZodObject<any>> = Extract<keyof z.infer<T>, string>;

// Helper type to get schema field names with better autocomplete support
export type SchemaFieldNames<T extends z.ZodObject<any>> = {
	[K in keyof z.infer<T>]: K extends string ? K : never;
}[keyof z.infer<T>];

// Type-safe value type that matches NativeAttributeValue but with better inference
export type TypedNativeValue<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T extends Array<infer U>
				? Array<TypedNativeValue<U>>
				: T extends Record<string, any>
					? { [K in keyof T]: TypedNativeValue<T[K]> }
					: NativeAttributeValue;

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

export interface FilterOperators<T, TBuilder> {
	equals(value: T): TBuilder;
	eq(value: T): TBuilder;
	ne(value: T): TBuilder;
	exists(): TBuilder;
	notExists(): TBuilder;
	in(values: T[]): TBuilder;
}
