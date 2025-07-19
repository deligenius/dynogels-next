import type {
	DynamoDBDocument,
	NativeAttributeValue,
	ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { IndexNames, ModelConfig } from "../types/Model.js";
import type {
	ConditionExpression,
	ScanOptions,
	ScanResult,
	SchemaFieldNames,
} from "../types/Scan.js";
import {
	QueryConditions,
	StringQueryConditions,
} from "../query/QueryConditions.js";
import { ScanExpressions } from "./ScanExpressions.js";

export class ScanBuilder<
	TSchema extends z.ZodObject<any>,
	TConfig extends ModelConfig<TSchema> = ModelConfig<TSchema>,
> {
	private filterConditions: ConditionExpression[] = [];
	private options: ScanOptions = {};
	private indexName?: string;
	private isLoadAll = false;

	constructor(
		private readonly client: DynamoDBDocument,
		private readonly config: TConfig,
	) {}

	filter<TField extends SchemaFieldNames<TSchema>>(
		fieldName: TField,
	): StringQueryConditions<TSchema, TField, ScanBuilder<TSchema, TConfig>> & QueryConditions<TSchema, TField, ScanBuilder<TSchema, TConfig>> {
		const existingKeys = this.getExistingValueKeys();
		const addCondition = (condition: ConditionExpression) => {
			this.filterConditions.push(condition);
			return this;
		};

		// Always return StringQueryConditions which extends QueryConditions
		// This ensures all methods are available regardless of field type
		return new StringQueryConditions(
			String(fieldName),
			addCondition,
			existingKeys,
		) as StringQueryConditions<TSchema, TField, ScanBuilder<TSchema, TConfig>> & QueryConditions<TSchema, TField, ScanBuilder<TSchema, TConfig>>;
	}

	usingIndex(indexName: IndexNames<TConfig>): this {
		this.indexName = indexName as string;
		return this;
	}

	consistentRead(enabled = true): this {
		this.options.ConsistentRead = enabled;
		return this;
	}

	limit(count: number): this {
		if (count <= 0) {
			throw new Error("Limit must be greater than 0");
		}
		this.options.Limit = count;
		return this;
	}

	segments(segment: number, totalSegments: number): this {
		if (totalSegments < 1 || totalSegments > 1000000) {
			throw new Error("TotalSegments must be between 1 and 1,000,000");
		}
		if (segment < 0 || segment >= totalSegments) {
			throw new Error(
				`Segment ${segment} must be between 0 and ${totalSegments - 1}`,
			);
		}

		this.options.Segment = segment;
		this.options.TotalSegments = totalSegments;
		return this;
	}

	startKey(key: Record<string, NativeAttributeValue>): this {
		this.options.ExclusiveStartKey = key;
		return this;
	}

	projectionExpression(expression: string): this {
		this.options.ProjectionExpression = expression;
		return this;
	}

	returnConsumedCapacity(level: "INDEXES" | "TOTAL" | "NONE" = "NONE"): this {
		this.options.ReturnConsumedCapacity = level;
		return this;
	}

	loadAll(): this {
		this.isLoadAll = true;
		return this;
	}

	async exec(): Promise<z.infer<TSchema>[]> {
		if (this.isLoadAll) {
			return this.execLoadAll();
		}

		const result = await this.execWithPagination();
		return result.items;
	}

	async execWithPagination(
		lastEvaluatedKey?: Record<string, any>,
	): Promise<ScanResult<z.infer<TSchema>>> {
		const request = this.buildRequest();

		if (lastEvaluatedKey) {
			request.ExclusiveStartKey = lastEvaluatedKey;
		}

		try {
			const response = await this.client.scan(request);

			const items = (response.Items || []).map((item) =>
				this.validateAndTransform(item),
			);

			return {
				items,
				lastEvaluatedKey: response.LastEvaluatedKey,
				count: response.Count || 0,
				scannedCount: response.ScannedCount || 0,
				consumedCapacity: response.ConsumedCapacity,
			};
		} catch (error) {
			throw new Error(
				`Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async *stream(): AsyncIterableIterator<z.infer<TSchema>[]> {
		let lastEvaluatedKey = this.options.ExclusiveStartKey;

		do {
			const result = await this.execWithPagination(lastEvaluatedKey);

			yield result.items;

			lastEvaluatedKey = result.lastEvaluatedKey;
		} while (lastEvaluatedKey);
	}

	private async execLoadAll(): Promise<z.infer<TSchema>[]> {
		const allItems: z.infer<TSchema>[] = [];

		for await (const items of this.stream()) {
			allItems.push(...items);
		}

		return allItems;
	}

	private buildRequest(): ScanCommandInput {
		const request: ScanCommandInput = {
			TableName: this.config.tableName,
		};

		// Apply all options with complete coverage
		if (this.options.ConsistentRead !== undefined) {
			request.ConsistentRead = this.options.ConsistentRead;
		}
		if (this.options.Limit !== undefined) {
			request.Limit = this.options.Limit;
		}
		if (this.options.Segment !== undefined) {
			request.Segment = this.options.Segment;
		}
		if (this.options.TotalSegments !== undefined) {
			request.TotalSegments = this.options.TotalSegments;
		}
		if (this.options.ProjectionExpression !== undefined) {
			request.ProjectionExpression = this.options.ProjectionExpression;
		}
		if (this.options.ReturnConsumedCapacity !== undefined) {
			request.ReturnConsumedCapacity = this.options.ReturnConsumedCapacity;
		}
		if (this.options.ExclusiveStartKey !== undefined) {
			request.ExclusiveStartKey = this.options.ExclusiveStartKey;
		}

		if (this.indexName) {
			request.IndexName = this.indexName;
		}

		// Handle projection expression attribute names
		const projectionAttributeNames: Record<string, string> = {};
		if (this.options.ProjectionExpression) {
			// Extract attribute name placeholders from projection expression
			const attributeNameMatches = this.options.ProjectionExpression.match(/#\w+/g);
			if (attributeNameMatches) {
				for (const placeholder of attributeNameMatches) {
					const attributeName = placeholder.substring(1); // Remove #
					projectionAttributeNames[placeholder] = attributeName;
				}
			}
		}

		// Build filter expression (no key conditions for scans)
		let expressionAttributeNames = { ...projectionAttributeNames };
		let expressionAttributeValues: Record<string, any> = {};

		if (this.filterConditions.length > 0) {
			const filterExpression = ScanExpressions.buildExpression(
				this.filterConditions,
			);
			if (filterExpression.expression) {
				request.FilterExpression = filterExpression.expression;

				// Merge attribute names from filter expression
				expressionAttributeNames = {
					...expressionAttributeNames,
					...filterExpression.attributeNames,
				};

				expressionAttributeValues = {
					...expressionAttributeValues,
					...filterExpression.attributeValues,
				};
			}
		}

		// Set expression attribute names and values if needed
		if (Object.keys(expressionAttributeNames).length > 0) {
			request.ExpressionAttributeNames = expressionAttributeNames;
		}

		if (Object.keys(expressionAttributeValues).length > 0) {
			request.ExpressionAttributeValues = expressionAttributeValues;
		}

		return request;
	}

	private getExistingValueKeys(): string[] {
		const filterExpr = ScanExpressions.buildExpression(this.filterConditions);
		return Object.keys(filterExpr.attributeValues);
	}


	private validateAndTransform(item: any): z.infer<TSchema> {
		try {
			return this.config.schema.parse(item);
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw new Error(
					`Validation failed: ${error.issues.map((i) => i.message).join(", ")}`,
				);
			}
			throw error;
		}
	}
}