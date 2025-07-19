import type {
	NativeAttributeValue,
	ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";

// ScanOptions that map directly to ScanCommandInput properties
export interface ScanOptions
	extends Pick<
		ScanCommandInput,
		| "ConsistentRead"
		| "Limit"
		| "ProjectionExpression"
		| "ReturnConsumedCapacity"
		| "Segment"
		| "TotalSegments"
	> {
	// Use NativeAttributeValue for pagination keys to match AWS SDK
	ExclusiveStartKey?: Record<string, NativeAttributeValue>;
}

export interface ScanResult<T> {
	items: T[];
	lastEvaluatedKey?: Record<string, NativeAttributeValue>;
	count: number;
	scannedCount: number;
	consumedCapacity?: any;
}

// Re-export from Query types for consistency
export type { ConditionExpression, SchemaKeys, SchemaFieldNames } from "./Query.js";