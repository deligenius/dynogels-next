import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { string, type z } from "zod";

interface TableOptions {
	hashKey: string;
	rangeKey?: string;
	timestamps?: boolean;
	schema: z.ZodType;
	validation?: {
		allowUnknown?: boolean;
	};
}

// Utility type for primary key objects
type ModelKey<
	ItemType,
	HKName extends keyof ItemType,
	RKName extends keyof ItemType | never,
> = { [P in HKName]: ItemType[P] } & (RKName extends never
	? never
	: { [P in RKName]: ItemType[P] });

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class Dynogels {
	private static client: DynamoDBDocument;
	private static ddbClient: DynamoDBClient;

	static initialize(client: DynamoDBClient) {
		Dynogels.ddbClient = client;
		Dynogels.client = DynamoDBDocument.from(client);
	}

	static define<const O extends TableOptions>(tableName: string, options: O) {
		return new Model<O>(Dynogels.client, options.schema, tableName, options);
	}
}

class Model<
	O extends TableOptions,
	InferredType extends z.infer<O["schema"]> = z.infer<O["schema"]>,
	HashKey extends O["hashKey"] = O["hashKey"],
	RangeKey extends O["rangeKey"] extends string
		? O["rangeKey"]
		: never = O["rangeKey"] extends string ? O["rangeKey"] : never,
> {
	constructor(
		private client: DynamoDBDocument,
		private schema: O["schema"],
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

		const result = await this.client.put({
			TableName: this.tableName,
			Item: itemToSave,
		});
		console.log(result);

		return validatedItem;
	}

	async get(key: ModelKey<InferredType, HashKey, RangeKey>) {
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
	) {
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

	async destroy(key: ModelKey<InferredType, HashKey, RangeKey>) {
		await this.client.delete({
			TableName: this.tableName,
			Key: key,
		});
	}
}
