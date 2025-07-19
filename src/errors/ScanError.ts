export class ScanValidationError extends Error {
	constructor(message: string, public field: string) {
		super(`Scan validation error on field '${field}': ${message}`);
		this.name = "ScanValidationError";
	}
}

export class ParallelScanError extends Error {
	constructor(message: string, public segment: number) {
		super(`Parallel scan error on segment ${segment}: ${message}`);
		this.name = "ParallelScanError";
	}
}

export class ScanExecutionError extends Error {
	constructor(message: string, public cause?: Error) {
		super(`Scan execution failed: ${message}`);
		this.name = "ScanExecutionError";
		this.cause = cause;
	}
}

export class ScanIndexError extends Error {
	constructor(indexName: string, tableName: string) {
		super(`Index '${indexName}' not found on table '${tableName}'`);
		this.name = "ScanIndexError";
	}
}