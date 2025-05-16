// type TableType = z.infer<typeof tableSchema>;

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Table } from "./archive/table.js";
import {
	DynamoDBDocument,
	DynamoDBDocumentClient,
	GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { Dynogels } from "./Table.js";

async function main() {
	const client = new DynamoDBClient({
		endpoint: "http://localhost:8000",
	});

	const ddbDocClient = DynamoDBDocument.from(client);
	const result = await ddbDocClient.put({
		TableName: "Test",
		Item: {
			id: "1",
			string: "string",
			number: 1,
			boolean: true,
			null: null,
			array: ["string", 1, true, null],
			object: {
				string: "string",
				number: 1,
			},
			undefined: undefined, // won't be saved
			numberSet: new Set([1, 2, 3]),
			stringSet: new Set(["string", "string2"]),
			uint8Array: new Uint8Array([1, 2, 3]),
		},
	});

	console.log(result);

	const result2 = await ddbDocClient.get({
		TableName: "Test",
		Key: { id: "1" },
	});

	console.log(result2);

	Dynogels.initialize(client);

	const TestModel = Dynogels.define("Test", {
		hashKey: "id",
		rangeKey: "timestamp",
		timestamps: true, // adds createdAt and updatedAt fields
		schema: z.object({
			id: z.string(),
			timestamp: z.string().datetime(),
			string: z.string(),
			number: z.number(),
			boolean: z.boolean(),
			null: z.null(),
			arraym: z.array(z.string()),
			object: z.any(),
			numberSet: z.set(z.number()),
			stringSet: z.set(z.string()),
			uint8Array: z.instanceof(Uint8Array),
		}),
		validation: {
			allowUnknown: true,
		},
	});

	const item = await TestModel.create({
		id: "1",
		string: "string",
		number: 1,
		boolean: true,
		null: null,
		arraym: ["string", "1", "true", "null"],
		object: {
			string: "string",
			number: 1,
		},
		numberSet: new Set([1, 2, 3]),
		stringSet: new Set(["string", "string2"]),
		uint8Array: new Uint8Array([1, 2, 3]),
		timestamp: new Date().toISOString(),
	});

	console.log(item);
}

main();
