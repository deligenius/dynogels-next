export { Model } from "./Model.js";
export { ModelFactory } from "./ModelFactory.js";
export { TableManager } from "./TableManager.js";
export type { GSIStatusReport } from "./TableManager.js";
export { QueryBuilder } from "./query/QueryBuilder.js";

// Model and GSI types
export type {
	ModelConfig,
	ModelOptions,
	PrimaryKey,
	UpdateInput,
	GSIConfig,
	LSIConfig,
	IndexInfo,
	GSIIndexNames,
	LSIIndexNames,
	IndexNames,
} from "./types/Model.js";

// Query types
export type {
	QueryOptions,
	QueryResult,
	ConditionExpression,
	DynamoDBExpression,
	SchemaKeys,
	IndexConfig,
} from "./types/Query.js";

// Error classes
export {
	ItemNotFoundError,
	ValidationError,
	GSIValidationError,
	IndexNotFoundError,
	ProjectionError,
} from "./errors/DynamoDBError.js";
