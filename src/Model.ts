import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ItemNotFoundError, ValidationError } from "./errors/DynamoDBError.js";
import { QueryBuilder } from "./query/QueryBuilder.js";
import { ScanBuilder } from "./scan/ScanBuilder.js";
import type {
	IndexInfo,
	ModelConfig,
	ModelOptions,
	UpdateInput,
} from "./types/Model.js";

type PrimaryKey<
	T extends Record<string, any>,
	HashKey extends keyof T,
	RangeKey extends keyof T | undefined = undefined,
> = RangeKey extends keyof T
	? {
		[K in HashKey]: T[K];
	} & {
		[K in RangeKey]: T[K];
	}
	: {
		[K in HashKey]: T[K];
	};

export class Model<
	Schema extends z.ZodObject<any>,
	SchemaType extends z.infer<Schema>,
	HashKey extends keyof SchemaType,
	RangeKey extends keyof SchemaType | undefined = undefined
> {
	constructor(
		private readonly client: DynamoDBDocument,
		public readonly config: ModelConfig<Schema> & {
			hashKey: HashKey;
			rangeKey?: RangeKey;
		}
	) { }

	async get(
		key: PrimaryKey<SchemaType, HashKey, RangeKey>,
		options: ModelOptions = {},
	): Promise<SchemaType | null> {
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
		item: Omit<SchemaType, "createdAt" | "updatedAt">,
	): Promise<SchemaType> {
		const now = new Date().toISOString();
		const timestamps = this.getTimestamps(now, now);

		const itemToSave = {
			...item,
			...timestamps,
		} as z.infer<Schema>;

		const validatedItem = this.validateAndTransform(itemToSave);

		await this.client.put({
			TableName: this.config.tableName,
			Item: validatedItem,
			ConditionExpression: `attribute_not_exists(${String(this.config.hashKey)})`,
		});

		return validatedItem;
	}

	async update(
		key: PrimaryKey<SchemaType, HashKey, RangeKey>,
		updates: UpdateInput<SchemaType>,
	): Promise<SchemaType> {
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
		} as z.infer<Schema>;

		const validatedItem = this.validateAndTransform(updatedItem);

		await this.client.put({
			TableName: this.config.tableName,
			Item: validatedItem,
		});

		return validatedItem;
	}

	async getMany(
		keys: PrimaryKey<SchemaType, HashKey, RangeKey>[],
		options: ModelOptions = {},
	): Promise<SchemaType[]> {
		if (keys.length === 0) {
			return [];
		}

		// DynamoDB BatchGetItem has a limit of 100 items per request
		const batches: PrimaryKey<SchemaType, HashKey, RangeKey>[][] = [];
		for (let i = 0; i < keys.length; i += 100) {
			batches.push(keys.slice(i, i + 100));
		}

		const results: SchemaType[] = [];

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
	): Promise<z.infer<Schema> | null> {
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

	private validateAndTransform(item: any): SchemaType {
		try {
			return this.config.schema.parse(item) as SchemaType;
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
		keyValues: Partial<SchemaType>,
	): QueryBuilder<Schema, SchemaType, HashKey, RangeKey> {
		return new QueryBuilder(
			this.client,
			this.config,
			keyValues,
		);
	}

	// scan(): ScanBuilder<TSchema> {
	// 	return new ScanBuilder(this.client, this.config);
	// }

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
