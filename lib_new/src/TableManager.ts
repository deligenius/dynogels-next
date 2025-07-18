import {
	CreateTableCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	type DynamoDBClient,
	ResourceInUseException,
	ResourceNotFoundException,
	type ScalarAttributeType,
} from "@aws-sdk/client-dynamodb";
import { z } from "zod";
import type { Model } from "./Model.js";
import {
	ResourceInUseError,
	ResourceNotFoundError,
} from "./errors/DynamoDBError.js";
import type { ModelConfig } from "./types/Model.js";

export class TableManager {
	constructor(private readonly client: DynamoDBClient) {}

	async createTable<TSchema extends z.ZodObject<any>>(
		model: Model<TSchema, any, any>,
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
		const attrs = [
			{
				AttributeName: String(config.hashKey),
				AttributeType: this.getAttributeType(
					config.schema.shape[config.hashKey],
				),
			},
		];

		if (config.rangeKey) {
			attrs.push({
				AttributeName: String(config.rangeKey),
				AttributeType: this.getAttributeType(
					config.schema.shape[config.rangeKey],
				),
			});
		}

		return attrs;
	}

	private getAttributeType(zodType: z.ZodType): ScalarAttributeType {
		if (zodType instanceof z.ZodString) return "S";
		if (zodType instanceof z.ZodNumber) return "N";
		if (zodType instanceof z.ZodArray) return "B";

		throw new Error(
			`Unsupported key type: ${zodType.constructor.name}. Keys must be string, number, or binary.`,
		);
	}
}
