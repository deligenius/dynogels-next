export abstract class DynamoDBError extends Error {
	abstract readonly code: string;
	abstract readonly statusCode: number;
}

export class ItemNotFoundError extends DynamoDBError {
	readonly code = "ItemNotFound";
	readonly statusCode = 404;
}

export class ConditionalCheckFailedError extends DynamoDBError {
	readonly code = "ConditionalCheckFailedException";
	readonly statusCode = 400;
}

export class ValidationError extends DynamoDBError {
	readonly code = "ValidationException";
	readonly statusCode = 400;
}

export class ResourceNotFoundError extends DynamoDBError {
	readonly code = "ResourceNotFoundException";
	readonly statusCode = 404;
}

export class ResourceInUseError extends DynamoDBError {
	readonly code = "ResourceInUseException";
	readonly statusCode = 400;
}

// GSI-specific error classes
export class GSIValidationError extends DynamoDBError {
	readonly code = "GSIValidationException";
	readonly statusCode = 400;

	constructor(
		message: string,
		public indexName: string,
	) {
		super(message);
		this.name = "GSIValidationError";
	}
}

export class IndexNotFoundError extends DynamoDBError {
	readonly code = "IndexNotFoundException";
	readonly statusCode = 404;

	constructor(indexName: string, tableName: string) {
		super(`Index '${indexName}' not found on table '${tableName}'`);
		this.name = "IndexNotFoundError";
	}
}

export class ProjectionError extends DynamoDBError {
	readonly code = "ProjectionException";
	readonly statusCode = 400;

	constructor(
		message: string,
		public indexName: string,
		public requestedAttributes: string[],
	) {
		super(message);
		this.name = "ProjectionError";
	}
}
