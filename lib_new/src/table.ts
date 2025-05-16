import {
	CreateTableCommand,
	type ScalarAttributeType,
	type DynamoDBClient,
	ResourceInUseException,
	DeleteTableCommand,
	ResourceNotFoundException,
	type DeleteTableCommandOutput,
	type CreateTableCommandOutput,
} from "@aws-sdk/client-dynamodb";
import {
	type DeleteCommandOutput,
	DynamoDBDocument,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

interface TableOptions<T extends z.ZodObject<any>> {
	hashKey: string;
	rangeKey?: string;
	timestamps?: boolean;
	schema: T;
	validation?: {
		allowUnknown?: boolean;
	};
}

// Utility type for primary key objects
type ModelKey<
	ItemType,
	HKName extends keyof ItemType,
	RKName extends keyof ItemType | undefined,
> = { [P in HKName]: ItemType[P] } & (RKName extends keyof ItemType
	? Partial<{ [P in RKName]: ItemType[P] }>
	: unknown);

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class Dynogels {
	private static client: DynamoDBDocument;
	private static ddbClient: DynamoDBClient;

	static initialize(client: DynamoDBClient) {
		Dynogels.ddbClient = client;
		Dynogels.client = DynamoDBDocument.from(client);
	}

	static define<const O extends TableOptions<any>>(
		tableName: string,
		options: O,
	) {
		return new Model<O>(Dynogels.client, options.schema, tableName, options);
	}
}

class Model<
	O extends TableOptions<any>,
	InferredType extends z.infer<O["schema"]> = z.infer<O["schema"]>,
	HashKey extends O["hashKey"] = O["hashKey"],
	RangeKey extends O["rangeKey"] = O["rangeKey"],
> {
	// @ts-ignore
	public type: InferredType;

	constructor(
		private client: DynamoDBDocument,
		public schema: O["schema"],
		private tableName: string,
		private options: O,
	) {}

	async create(item: InferredType): Promise<InferredType> {
		const validatedItem = this.schema.parse(item);
		const timestamp = new Date().toISOString();

		const itemToSave = {
			...validatedItem,
			...(this.options.timestamps && {
				createdAt: timestamp,
				updatedAt: timestamp,
			}),
		};

		await this.client.put({
			TableName: this.tableName,
			Item: itemToSave,
		});

		return validatedItem;
	}

	async get(
		key: ModelKey<InferredType, HashKey, RangeKey>,
	): Promise<InferredType | null> {
		const result = await this.client.get({
			TableName: this.tableName,
			Key: key,
		});

		if (!result.Item) return null;
		return this.options.schema.parse(result.Item);
	}

	async update(
		key: ModelKey<InferredType, HashKey, RangeKey>,
		updates: Partial<InferredType>,
	): Promise<InferredType> {
		const currentItem = await this.get(key);
		if (!currentItem) {
			throw new Error("Item not found");
		}

		const updatedItem = {
			...currentItem,
			...updates,
			...(this.options.timestamps && {
				updatedAt: new Date().toISOString(),
			}),
		};

		const validatedItem = this.options.schema.parse(updatedItem);

		await this.client.put({
			TableName: this.tableName,
			Item: validatedItem,
		});

		return validatedItem;
	}

	async destroy(
		key: ModelKey<InferredType, HashKey, RangeKey>,
	): Promise<DeleteCommandOutput> {
		const result = await this.client.delete({
			TableName: this.tableName,
			Key: key,
		});

		return result;
	}

	async createTable(): Promise<CreateTableCommandOutput | undefined> {
		function getAttrType(shape: z.ZodType<any>) {
			if (shape instanceof z.ZodString) {
				return "S";
			}
			if (shape instanceof z.ZodNumber) {
				return "N";
			}
			if (shape instanceof z.ZodArray) {
				return "B"; // Uint8Array
			}
			throw new Error("Unsupported Hashkey/Rangekey type");
		}

		const hashKeyType = getAttrType(
			this.options.schema.shape[this.options.hashKey],
		);
		let rangeKeyType: ScalarAttributeType | undefined;
		if (this.options.rangeKey) {
			rangeKeyType = getAttrType(
				this.options.schema.shape[this.options.rangeKey],
			);
		}

		// depends on hashKeyType and rangeKeyType, create table use client
		const command = new CreateTableCommand({
			TableName: this.tableName,
			KeySchema: [
				{
					AttributeName: this.options.hashKey,
					KeyType: "HASH",
				},
				...(this.options.rangeKey
					? [
							{
								AttributeName: this.options.rangeKey,
								KeyType: "RANGE",
							} as const,
						]
					: []),
			],
			AttributeDefinitions: [
				{
					AttributeName: this.options.hashKey,
					AttributeType: hashKeyType,
				},
				...(this.options.rangeKey
					? [
							{
								AttributeName: this.options.rangeKey,
								AttributeType: rangeKeyType,
							},
						]
					: []),
			],
			ProvisionedThroughput: {
				ReadCapacityUnits: 1,
				WriteCapacityUnits: 1,
			},
		});
		try {
			const table = await this.client.send(command);
			return table;
		} catch (err) {
			if (err instanceof ResourceInUseException) {
				console.error(`Table ${this.tableName} already exists`);
			} else {
				console.error("Create table failed", err);
			}
			return undefined;
		}
	}
	async deleteTable(): Promise<DeleteTableCommandOutput | undefined> {
		const command = new DeleteTableCommand({
			TableName: this.tableName,
		});
		try {
			const table = await this.client.send(command);
			return table;
		} catch (err) {
			if (err instanceof ResourceNotFoundException) {
				console.error(`Table ${this.tableName} does not exist`);
			} else {
				console.error("Delete table failed", err);
			}
			return undefined;
		}
	}

	async query(indexName: string, keys: Record<string, string>) {
		const {
			UpdateExpressions,
			ExpressionAttributeNames,
			ExpressionAttributeValues,
		} = Object.entries(keys).reduce(
			(acc, [key, value], index) => {
				acc.UpdateExpressions.push(`#key${index} = :value${index}`);
				acc.ExpressionAttributeNames[`#key${index}`] = key;
				acc.ExpressionAttributeValues[`:value${index}`] = value;
				return acc;
			},
			{
				UpdateExpressions: [] as string[],
				ExpressionAttributeNames: {} as Record<string, string>,
				ExpressionAttributeValues: {} as Record<string, any>,
			},
		);

		const result = await this.client.query({
			TableName: this.tableName,
			IndexName: indexName,
			KeyConditionExpression: UpdateExpressions.join(" AND "),
			ExpressionAttributeNames,
			ExpressionAttributeValues,
		});

		return result.Items;
	}
}
