import {
	CreateTableCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	type DynamoDBClient,
	type GlobalSecondaryIndex,
	type LocalSecondaryIndex,
	type Projection,
	ResourceInUseException,
	ResourceNotFoundException,
	type ScalarAttributeType,
	UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import { z } from "zod";
import type { Model } from "./Model.js";
import {
	ResourceInUseError,
	ResourceNotFoundError,
} from "./errors/DynamoDBError.js";
import type { GSIConfig, ModelConfig } from "./types/Model.js";

// GSI status reporting interface
export interface GSIStatusReport {
	indexName: string;
	status: string;
	itemCount: number;
	sizeBytes: number;
	backfilling: boolean;
	throughput: { read: number; write: number };
}

export class TableManager {
	static instance: TableManager;

	static async initialize(client: DynamoDBClient) {
		if (!TableManager.instance) {
			TableManager.instance = new TableManager(client);
		}
		return TableManager.instance;
	}

	static getInstance() {
		if (!TableManager.instance) {
			throw new Error("TableManager not initialized");
		}
		return TableManager.instance;
	}

	private constructor(private readonly client: DynamoDBClient) {}

	async createTable<TSchema extends z.ZodObject<any>>(
		model: Model<TSchema, any, any, any>,
		throughput: { read: number; write: number } = { read: 1, write: 1 },
	): Promise<void> {
		const config = model.config;
		try {
			const command = new CreateTableCommand({
				TableName: config.tableName,
				KeySchema: this.buildKeySchema(config),
				AttributeDefinitions: this.buildAttributeDefinitions(config),
				ProvisionedThroughput: {
					ReadCapacityUnits: throughput.read,
					WriteCapacityUnits: throughput.write,
				},
				GlobalSecondaryIndexes: this.buildGlobalSecondaryIndexes(config),
				LocalSecondaryIndexes: this.buildLocalSecondaryIndexes(config),
			});

			await this.client.send(command);
		} catch (error) {
			if (error instanceof ResourceInUseException) {
				throw new ResourceInUseError(
					`Table ${config.tableName} already exists`,
				);
			}
			throw error;
		}
	}

	async deleteTable(tableName: string): Promise<void> {
		try {
			const command = new DeleteTableCommand({ TableName: tableName });
			await this.client.send(command);
		} catch (error) {
			if (error instanceof ResourceNotFoundException) {
				throw new ResourceNotFoundError(`Table ${tableName} does not exist`);
			}
			throw error;
		}
	}

	async tableExists(tableName: string): Promise<boolean> {
		try {
			await this.client.send(
				new DescribeTableCommand({ TableName: tableName }),
			);
			return true;
		} catch (error) {
			if (error instanceof ResourceNotFoundException) {
				return false;
			}
			throw error;
		}
	}

	// GSI management methods
	async addGSI<TSchema extends z.ZodObject<any>>(
		tableName: string,
		indexName: string,
		gsiConfig: GSIConfig<TSchema>,
	): Promise<void> {
		const updateCommand = new UpdateTableCommand({
			TableName: tableName,
			GlobalSecondaryIndexUpdates: [
				{
					Create: {
						IndexName: indexName,
						KeySchema: [
							{
								AttributeName: String(gsiConfig.hashKey),
								KeyType: "HASH",
							},
							...(gsiConfig.rangeKey
								? [
										{
											AttributeName: String(gsiConfig.rangeKey),
											KeyType: "RANGE" as const,
										},
									]
								: []),
						],
						Projection: this.buildProjection(
							gsiConfig.projectionType,
							gsiConfig.projectedAttributes,
						),
						ProvisionedThroughput: {
							ReadCapacityUnits: gsiConfig.throughput?.read || 1,
							WriteCapacityUnits: gsiConfig.throughput?.write || 1,
						},
					},
				},
			],
		});

		await this.client.send(updateCommand);
	}

	async removeGSI(tableName: string, indexName: string): Promise<void> {
		const updateCommand = new UpdateTableCommand({
			TableName: tableName,
			GlobalSecondaryIndexUpdates: [
				{
					Delete: {
						IndexName: indexName,
					},
				},
			],
		});

		await this.client.send(updateCommand);
	}

	async getGSIStatus(tableName: string): Promise<GSIStatusReport[]> {
		const describeCommand = new DescribeTableCommand({ TableName: tableName });
		const response = await this.client.send(describeCommand);

		const gsiReports: GSIStatusReport[] = [];
		const gsis = response.Table?.GlobalSecondaryIndexes;
		if (gsis) {
			for (const gsi of gsis) {
				gsiReports.push({
					indexName: gsi.IndexName ?? "",
					status: gsi.IndexStatus ?? "",
					itemCount: gsi.ItemCount || 0,
					sizeBytes: gsi.IndexSizeBytes || 0,
					backfilling: gsi.IndexStatus === "CREATING",
					throughput: {
						read: gsi.ProvisionedThroughput?.ReadCapacityUnits || 0,
						write: gsi.ProvisionedThroughput?.WriteCapacityUnits || 0,
					},
				});
			}
		}

		return gsiReports;
	}

	private buildKeySchema<TSchema extends z.ZodObject<any>>(
		config: ModelConfig<TSchema> & {
			hashKey: string;
			rangeKey?: string;
		},
	): CreateTableCommand["input"]["KeySchema"] {
		const keySchema: CreateTableCommand["input"]["KeySchema"] = [
			{
				AttributeName: String(config.hashKey),
				KeyType: "HASH" as const,
			},
		];

		if (config.rangeKey) {
			keySchema.push({
				AttributeName: String(config.rangeKey),
				KeyType: "RANGE" as const,
			});
		}

		return keySchema;
	}

	private buildAttributeDefinitions<TSchema extends z.ZodObject<any>>(
		config: ModelConfig<TSchema> & {
			hashKey: string;
			rangeKey?: string;
		},
	): CreateTableCommand["input"]["AttributeDefinitions"] {
		const attributes = new Set<string>();

		// Add table keys
		attributes.add(String(config.hashKey));
		if (config.rangeKey) {
			attributes.add(String(config.rangeKey));
		}

		// Add GSI keys
		if (config.globalSecondaryIndexes) {
			for (const gsiConfig of Object.values(config.globalSecondaryIndexes)) {
				attributes.add(String(gsiConfig.hashKey));
				if (gsiConfig.rangeKey) {
					attributes.add(String(gsiConfig.rangeKey));
				}
			}
		}

		// Add LSI keys
		if (config.localSecondaryIndexes) {
			for (const lsiConfig of Object.values(config.localSecondaryIndexes)) {
				attributes.add(String(lsiConfig.rangeKey));
			}
		}

		return Array.from(attributes).map((attr) => ({
			AttributeName: attr,
			AttributeType: this.getAttributeType(config.schema.shape[attr]),
		}));
	}

	private buildGlobalSecondaryIndexes<TSchema extends z.ZodObject<any>>(
		config: ModelConfig<TSchema>,
	): GlobalSecondaryIndex[] | undefined {
		if (
			!config.globalSecondaryIndexes ||
			Object.keys(config.globalSecondaryIndexes).length === 0
		) {
			return undefined;
		}

		return Object.entries(config.globalSecondaryIndexes).map(
			([indexName, gsiConfig]) => ({
				IndexName: indexName,
				KeySchema: [
					{
						AttributeName: String(gsiConfig.hashKey),
						KeyType: "HASH",
					},
					...(gsiConfig.rangeKey
						? [
								{
									AttributeName: String(gsiConfig.rangeKey),
									KeyType: "RANGE" as const,
								},
							]
						: []),
				],
				Projection: this.buildProjection(
					gsiConfig.projectionType,
					gsiConfig.projectedAttributes,
				),
				ProvisionedThroughput: {
					ReadCapacityUnits: gsiConfig.throughput?.read || 1,
					WriteCapacityUnits: gsiConfig.throughput?.write || 1,
				},
			}),
		);
	}

	private buildLocalSecondaryIndexes<TSchema extends z.ZodObject<any>>(
		config: ModelConfig<TSchema> & {
			hashKey: string;
		},
	): LocalSecondaryIndex[] | undefined {
		if (
			!config.localSecondaryIndexes ||
			Object.keys(config.localSecondaryIndexes).length === 0
		) {
			return undefined;
		}

		return Object.entries(config.localSecondaryIndexes).map(
			([indexName, lsiConfig]) => ({
				IndexName: indexName,
				KeySchema: [
					{
						AttributeName: String(config.hashKey), // LSI uses table's hash key
						KeyType: "HASH",
					},
					{
						AttributeName: String(lsiConfig.rangeKey),
						KeyType: "RANGE",
					},
				],
				Projection: this.buildProjection(
					lsiConfig.projectionType,
					lsiConfig.projectedAttributes,
				),
			}),
		);
	}

	private buildProjection(
		projectionType: "ALL" | "KEYS_ONLY" | "INCLUDE",
		projectedAttributes?: (string | number | symbol)[],
	): Projection {
		const projection: Projection = {
			ProjectionType: projectionType,
		};

		if (projectionType === "INCLUDE" && projectedAttributes?.length) {
			projection.NonKeyAttributes = projectedAttributes.map(String);
		}

		return projection;
	}

	private getAttributeType(zodType: z.ZodType): ScalarAttributeType {
		if (zodType instanceof z.ZodString || zodType instanceof z.ZodEnum)
			return "S";
		if (zodType instanceof z.ZodNumber) return "N";
		if (zodType instanceof z.ZodArray) return "B";

		throw new Error(
			`Unsupported key type: ${zodType.constructor.name}. Keys must be string, number, or binary.`,
		);
	}
}
