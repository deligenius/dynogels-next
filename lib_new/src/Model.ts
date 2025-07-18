import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ItemNotFoundError, ValidationError } from "./errors/DynamoDBError.js";
import { QueryBuilder } from "./query/QueryBuilder.js";
import type { ModelConfig, ModelOptions, UpdateInput } from "./types/Model.js";

type PrimaryKey<
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

export class Model<
	TSchema extends z.ZodObject<any>,
	THashKey extends keyof z.infer<TSchema>,
	TRangeKey extends keyof z.infer<TSchema> | undefined = undefined,
> {
	constructor(
		private readonly client: DynamoDBDocument,
		public readonly config: ModelConfig<TSchema> & {
			hashKey: THashKey;
			rangeKey?: TRangeKey;
		},
	) {}

	async get(
		key: PrimaryKey<TSchema, THashKey, TRangeKey>,
		options: ModelOptions = {},
	): Promise<z.infer<TSchema> | null> {
		const result = await this.client.get({
			TableName: this.config.tableName,
			Key: key,
			ConsistentRead: options.consistentRead,
		});

		if (!result.Item) {
			return null;
		}

		return this.validateAndTransform(result.Item);
	}

	async create(
		item: Omit<z.infer<TSchema>, "createdAt" | "updatedAt">,
	): Promise<z.infer<TSchema>> {
		const now = new Date().toISOString();
		const timestamps = this.getTimestamps(now, now);

		const itemToSave = {
			...item,
			...timestamps,
		} as z.infer<TSchema>;

		const validatedItem = this.validateAndTransform(itemToSave);

		await this.client.put({
			TableName: this.config.tableName,
			Item: validatedItem,
			ConditionExpression: `attribute_not_exists(${String(this.config.hashKey)})`,
		});

		return validatedItem;
	}

	async update(
		key: PrimaryKey<TSchema, THashKey, TRangeKey>,
		updates: UpdateInput<z.infer<TSchema>>,
	): Promise<z.infer<TSchema>> {
		const existingItem = await this.get(key, { consistentRead: true });
		if (!existingItem) {
			throw new ItemNotFoundError(
				`Item with key ${JSON.stringify(key)} not found`,
			);
		}

		const now = new Date().toISOString();
		const timestamps = this.getTimestamps(existingItem.createdAt, now);

		const updatedItem = {
			...existingItem,
			...updates,
			...timestamps,
		} as z.infer<TSchema>;

		const validatedItem = this.validateAndTransform(updatedItem);

		await this.client.put({
			TableName: this.config.tableName,
			Item: validatedItem,
		});

		return validatedItem;
	}

	async getMany(
		keys: PrimaryKey<TSchema, THashKey, TRangeKey>[],
		options: ModelOptions = {},
	): Promise<z.infer<TSchema>[]> {
		if (keys.length === 0) {
			return [];
		}

		// DynamoDB BatchGetItem has a limit of 100 items per request
		const batches: PrimaryKey<TSchema, THashKey, TRangeKey>[][] = [];
		for (let i = 0; i < keys.length; i += 100) {
			batches.push(keys.slice(i, i + 100));
		}

		const results: z.infer<TSchema>[] = [];

		const batchResults = await Promise.all(
			batches.map((batch) =>
				this.client.batchGet({
					RequestItems: {
						[this.config.tableName]: {
							Keys: batch,
							ConsistentRead: options.consistentRead,
						},
					},
				}),
			),
		);

		for (const result of batchResults) {
			if (!result.Responses?.[this.config.tableName]) {
				continue;
			}
			for (const item of result.Responses[this.config.tableName]) {
				results.push(this.validateAndTransform(item));
			}
		}

		return results;
	}

	async destroy(
		key: any, // Will be properly typed by the factory
	): Promise<z.infer<TSchema> | null> {
		const result = await this.client.delete({
			TableName: this.config.tableName,
			Key: key,
			ReturnValues: "ALL_OLD",
		});

		if (!result.Attributes) {
			return null;
		}

		return this.validateAndTransform(result.Attributes);
	}

	private validateAndTransform(item: any): z.infer<TSchema> {
		try {
			return this.config.schema.parse(item);
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw new ValidationError(
					`Validation failed: ${error.issues.map((i) => i.message).join(", ")}`,
				);
			}
			throw error;
		}
	}

	query(
		keyValues: Partial<z.infer<TSchema>>,
	): QueryBuilder<TSchema, THashKey, TRangeKey> {
		return new QueryBuilder(this.client, this.config, keyValues);
	}

	private getTimestamps(createdAt?: string, updatedAt?: string) {
		const timestamps: { createdAt?: string; updatedAt?: string } = {};

		if (this.config.timestamps?.createdAt && createdAt) {
			timestamps.createdAt = createdAt;
		}

		if (this.config.timestamps?.updatedAt && updatedAt) {
			timestamps.updatedAt = updatedAt;
		}

		return timestamps;
	}
}
