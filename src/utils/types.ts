import { z } from 'zod';
import { randomUUID } from 'crypto';

// Equivalent to dynogels.types from the original library
export const DynogelsTypes = {
  // String set type - non-empty array of strings
  stringSet: () => z.array(z.string()).min(1).transform(val => new Set(val)),
  
  // Number set type - non-empty array of numbers  
  numberSet: () => z.array(z.number()).min(1).transform(val => new Set(val)),
  
  // Binary set type - non-empty array of Uint8Array
  binarySet: () => z.array(z.instanceof(Uint8Array)).min(1).transform(val => new Set(val)),
  
  // UUID type with automatic generation
  uuid: () => z.string().uuid().default(() => randomUUID()),
  
  // TimeUUID type - for now just a UUID, can be enhanced later with time-based UUIDs
  timeUUID: () => z.string().uuid().default(() => randomUUID()),
  
  // Additional convenience types
  email: () => z.string().email(),
  url: () => z.string().url(),
  date: () => z.date(),
  
  // JSON type for arbitrary objects
  json: () => z.record(z.any()),
  
  // Buffer type for binary data
  buffer: () => z.instanceof(Uint8Array),
} as const;

// Type helper to extract the inferred type from a Zod schema
export type InferZodType<T> = T extends z.ZodType<infer U> ? U : never;

// Type guard functions
export function isStringSet(value: any): value is Set<string> {
  return value instanceof Set && Array.from(value).every(item => typeof item === 'string');
}

export function isNumberSet(value: any): value is Set<number> {
  return value instanceof Set && Array.from(value).every(item => typeof item === 'number');
}

export function isBinarySet(value: any): value is Set<Uint8Array> {
  return value instanceof Set && Array.from(value).every(item => item instanceof Uint8Array);
}

// Convert sets to arrays for DynamoDB serialization
export function serializeSet(value: Set<any>): any[] {
  return Array.from(value);
}

// Convert arrays to sets for internal use
export function deserializeSet<T>(value: T[]): Set<T> {
  return new Set(value);
}