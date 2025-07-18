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
