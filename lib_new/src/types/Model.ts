import type { z } from 'zod';

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
  indexes?: {
    [indexName: string]: {
      hashKey: string;
      rangeKey?: string;
    };
  };
}

export interface ModelOptions {
  consistentRead?: boolean;
}

// Utility type for primary keys - only includes hash and range key fields
export type PrimaryKey<
  TSchema extends z.ZodObject<any>,
  THashKey extends keyof z.infer<TSchema>,
  TRangeKey extends keyof z.infer<TSchema> | undefined = undefined
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
export type UpdateInput<T> = Partial<Omit<T, 'createdAt'>> & {
  updatedAt?: never; // Prevent manual updatedAt setting
};