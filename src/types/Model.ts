import type { z } from "zod";

// GSI Configuration interface
export interface GSIConfig<TSchema extends z.ZodObject<any>> {
	hashKey: keyof z.infer<TSchema>;
	rangeKey?: keyof z.infer<TSchema>;
	projectionType: "ALL" | "KEYS_ONLY" | "INCLUDE";
	projectedAttributes?: (keyof z.infer<TSchema>)[];
	throughput?: { read: number; write: number };
}

// LSI Configuration interface
export interface LSIConfig<TSchema extends z.ZodObject<any>> {
	rangeKey: keyof z.infer<TSchema>;
	projectionType: "ALL" | "KEYS_ONLY" | "INCLUDE";
	projectedAttributes?: (keyof z.infer<TSchema>)[];
}

// Runtime index information for validation
export interface IndexInfo {
	name: string;
	type: "GSI" | "LSI";
	hashKey: string;
	rangeKey?: string;
	projectionType: string;
	projectedAttributes?: string[];
}

export interface ModelConfig<T extends z.ZodObject<any>> {
	schema: T;
	tableName: string;
	timestamps?: {
		createdAt?: boolean; // ISO string
		updatedAt?: boolean; // ISO string
	};
	ttl?: {
		attribute: keyof z.infer<T>;
	};
	globalSecondaryIndexes?: Record<string, GSIConfig<T>>;
	localSecondaryIndexes?: Record<string, LSIConfig<T>>;
}

export interface ModelOptions {
	consistentRead?: boolean;
}

// Type utility for extracting GSI index names for compile-time validation
export type GSIIndexNames<TConfig extends ModelConfig<any>> =
	TConfig["globalSecondaryIndexes"] extends Record<string, any>
		? keyof TConfig["globalSecondaryIndexes"]
		: never;

// Type utility for extracting LSI index names
export type LSIIndexNames<TConfig extends ModelConfig<any>> =
	TConfig["localSecondaryIndexes"] extends Record<string, any>
		? keyof TConfig["localSecondaryIndexes"]
		: never;

// Combined index names (GSI + LSI)
export type IndexNames<TConfig extends ModelConfig<any>> =
	| GSIIndexNames<TConfig>
	| LSIIndexNames<TConfig>;

// Utility type for primary keys - only includes hash and range key fields
export type PrimaryKey<
	TSchema extends z.ZodObject<any>,
	THashKey extends keyof z.infer<TSchema>,
	TRangeKey extends keyof z.infer<TSchema> | undefined = undefined,
> = TRangeKey extends keyof z.infer<TSchema>
	? {
			[K in THashKey]: z.infer<TSchema>[K];
		} & {
			[K in TRangeKey]: z.infer<TSchema>[K];
		}
	: {
			[K in THashKey]: z.infer<TSchema>[K];
		};

// Utility type for partial updates
export type UpdateInput<T> = Partial<Omit<T, "createdAt">> & {
	updatedAt?: never; // Prevent manual updatedAt setting
};
