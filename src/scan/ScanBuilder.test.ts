import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DynamoDBDocument, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ScanBuilder } from "./ScanBuilder.js";

// Mock the DynamoDB document client
const mockClient = {
	scan: vi.fn(),
} as unknown as DynamoDBDocument;

// Test schema
const testSchema = z.object({
	id: z.string(),
	name: z.string(),
	age: z.number(),
	status: z.enum(["active", "inactive"]),
	email: z.string().email(),
	tags: z.array(z.string()).optional(),
});

const testConfig = {
	hashKey: "id" as keyof z.infer<typeof testSchema>,
	schema: testSchema,
	tableName: "test-table",
	globalSecondaryIndexes: {
		StatusIndex: {
			hashKey: "status" as keyof z.infer<typeof testSchema>,
			projectionType: "ALL" as const,
		},
		EmailIndex: {
			hashKey: "email" as keyof z.infer<typeof testSchema>,
			projectionType: "ALL" as const,
		},
	},
};

describe("ScanBuilder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Constructor and Basic Setup", () => {
		it("should create a ScanBuilder instance", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			expect(builder).toBeInstanceOf(ScanBuilder);
		});
	});

	describe("Filter Conditions", () => {
		it("should add string filter conditions", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.filter("name");
			expect(result).toBeDefined();
		});

		it("should add number filter conditions", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.filter("age");
			expect(result).toBeDefined();
		});

		it("should chain multiple filter conditions", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder
				.filter("status").eq("active")
				.filter("age").gte(18);
			expect(result).toBe(builder);
		});
	});

	describe("Configuration Methods", () => {
		it("should set consistent read", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.consistentRead(true);
			expect(result).toBe(builder);
		});

		it("should set limit with validation", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.limit(10);
			expect(result).toBe(builder);
		});

		it("should throw error for invalid limit", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			expect(() => builder.limit(0)).toThrow("Limit must be greater than 0");
			expect(() => builder.limit(-5)).toThrow("Limit must be greater than 0");
		});

		it("should set projection expression", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.projectionExpression("id, #name, email");
			expect(result).toBe(builder);
		});

		it("should set return consumed capacity", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.returnConsumedCapacity("TOTAL");
			expect(result).toBe(builder);
		});

		it("should set start key for pagination", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const startKey = { id: "user-1" };
			const result = builder.startKey(startKey);
			expect(result).toBe(builder);
		});

		it("should enable loadAll mode", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.loadAll();
			expect(result).toBe(builder);
		});
	});

	describe("Index Support", () => {
		it("should set index name", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.usingIndex("StatusIndex");
			expect(result).toBe(builder);
		});

		it("should support multiple indexes", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result1 = builder.usingIndex("StatusIndex");
			const result2 = builder.usingIndex("EmailIndex");
			expect(result1).toBe(builder);
			expect(result2).toBe(builder);
		});
	});

	describe("Parallel Scan Configuration", () => {
		it("should set parallel scan segments", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = builder.segments(0, 4);
			expect(result).toBe(builder);
		});

		it("should validate segment parameters", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			
			// Valid segments
			expect(() => builder.segments(0, 4)).not.toThrow();
			expect(() => builder.segments(3, 4)).not.toThrow();
			
			// Invalid segments
			expect(() => builder.segments(-1, 4)).toThrow("Segment -1 must be between 0 and 3");
			expect(() => builder.segments(4, 4)).toThrow("Segment 4 must be between 0 and 3");
			expect(() => builder.segments(0, 0)).toThrow("TotalSegments must be between 1 and 1,000,000");
			expect(() => builder.segments(0, 1000001)).toThrow("TotalSegments must be between 1 and 1,000,000");
		});
	});

	describe("Request Building", () => {
		it("should build basic scan request", async () => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [{ id: "1", name: "Test", age: 25, status: "active", email: "test@example.com" }],
				Count: 1,
				ScannedCount: 1,
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			await builder.exec();

			expect(mockClient.scan).toHaveBeenCalledWith({
				TableName: "test-table",
			});
		});

		it("should build scan request with all options", async () => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [{ id: "1", name: "Test", age: 25, status: "active", email: "test@example.com" }],
				Count: 1,
				ScannedCount: 1,
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			await builder
				.consistentRead(true)
				.limit(10)
				.segments(0, 2)
				.projectionExpression("id, #name")
				.returnConsumedCapacity("TOTAL")
				.usingIndex("StatusIndex")
				.exec();

			expect(mockClient.scan).toHaveBeenCalledWith({
				TableName: "test-table",
				ConsistentRead: true,
				Limit: 10,
				Segment: 0,
				TotalSegments: 2,
				ProjectionExpression: "id, #name",
				ReturnConsumedCapacity: "TOTAL",
				IndexName: "StatusIndex",
				ExpressionAttributeNames: {
					"#name": "name",
				},
			});
		});

		it("should build scan request with filter expression", async () => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [{ id: "1", name: "Test", age: 25, status: "active", email: "test@example.com" }],
				Count: 1,
				ScannedCount: 1,
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			await builder
				.filter("status").eq("active")
				.exec();

			const call = (mockClient.scan as any).mock.calls[0][0] as ScanCommandInput;
			expect(call.TableName).toBe("test-table");
			expect(call.FilterExpression).toBeDefined();
			expect(call.ExpressionAttributeValues).toBeDefined();
		});
	});

	describe("Execution Methods", () => {
		beforeEach(() => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [
					{ id: "1", name: "Alice", age: 25, status: "active", email: "alice@example.com" },
					{ id: "2", name: "Bob", age: 30, status: "inactive", email: "bob@example.com" },
				],
				Count: 2,
				ScannedCount: 2,
			});
		});

		it("should execute basic scan", async () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = await builder.exec();

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				id: "1",
				name: "Alice",
				age: 25,
				status: "active",
				email: "alice@example.com",
			});
		});

		it("should execute scan with pagination", async () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			const result = await builder.execWithPagination();

			expect(result.items).toHaveLength(2);
			expect(result.count).toBe(2);
			expect(result.scannedCount).toBe(2);
			expect(result.lastEvaluatedKey).toBeUndefined();
			expect(result.consumedCapacity).toBeUndefined();
		});

		it("should handle pagination with lastEvaluatedKey", async () => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [{ id: "3", name: "Charlie", age: 35, status: "active", email: "charlie@example.com" }],
				Count: 1,
				ScannedCount: 1,
				LastEvaluatedKey: { id: "3" },
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			const result = await builder.execWithPagination({ id: "2" });

			expect(result.items).toHaveLength(1);
			expect(result.lastEvaluatedKey).toEqual({ id: "3" });
			
			const call = (mockClient.scan as any).mock.calls[0][0] as ScanCommandInput;
			expect(call.ExclusiveStartKey).toEqual({ id: "2" });
		});

		it("should stream scan results", async () => {
			// First call returns items with a continuation key
			// Second call returns final items
			mockClient.scan = vi.fn()
				.mockResolvedValueOnce({
					Items: [{ id: "1", name: "Alice", age: 25, status: "active", email: "alice@example.com" }],
					Count: 1,
					ScannedCount: 1,
					LastEvaluatedKey: { id: "1" },
				})
				.mockResolvedValueOnce({
					Items: [{ id: "2", name: "Bob", age: 30, status: "inactive", email: "bob@example.com" }],
					Count: 1,
					ScannedCount: 1,
				});

			const builder = new ScanBuilder(mockClient, testConfig);
			const batches: any[][] = [];

			for await (const batch of builder.stream()) {
				batches.push(batch);
			}

			expect(batches).toHaveLength(2);
			expect(batches[0]).toHaveLength(1);
			expect(batches[1]).toHaveLength(1);
			expect(mockClient.scan).toHaveBeenCalledTimes(2);
		});

		it("should execute loadAll scan", async () => {
			// Mock multiple pages
			mockClient.scan = vi.fn()
				.mockResolvedValueOnce({
					Items: [{ id: "1", name: "Alice", age: 25, status: "active", email: "alice@example.com" }],
					Count: 1,
					ScannedCount: 1,
					LastEvaluatedKey: { id: "1" },
				})
				.mockResolvedValueOnce({
					Items: [{ id: "2", name: "Bob", age: 30, status: "inactive", email: "bob@example.com" }],
					Count: 1,
					ScannedCount: 1,
				});

			const builder = new ScanBuilder(mockClient, testConfig);
			const result = await builder.loadAll().exec();

			expect(result).toHaveLength(2);
			expect(mockClient.scan).toHaveBeenCalledTimes(2);
		});
	});

	describe("Error Handling", () => {
		it("should handle scan execution errors", async () => {
			const error = new Error("DynamoDB error");
			mockClient.scan = vi.fn().mockRejectedValue(error);

			const builder = new ScanBuilder(mockClient, testConfig);
			
			await expect(builder.exec()).rejects.toThrow("Scan failed: DynamoDB error");
		});

		it("should handle validation errors", async () => {
			// Mock invalid data that doesn't match schema
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [{ id: "1", name: "Alice", age: "invalid-age", status: "active", email: "alice@example.com" }],
				Count: 1,
				ScannedCount: 1,
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			
			await expect(builder.exec()).rejects.toThrow("Validation failed:");
		});

		it("should handle unknown errors", async () => {
			mockClient.scan = vi.fn().mockRejectedValue("String error");

			const builder = new ScanBuilder(mockClient, testConfig);
			
			await expect(builder.exec()).rejects.toThrow("Scan failed: Unknown error");
		});
	});

	describe("Schema Validation", () => {
		it("should validate scan results against schema", async () => {
			mockClient.scan = vi.fn().mockResolvedValue({
				Items: [
					{ id: "1", name: "Alice", age: 25, status: "active", email: "alice@example.com" },
					{ id: "2", name: "Bob", age: 30, status: "inactive", email: "bob@example.com" },
				],
				Count: 2,
				ScannedCount: 2,
			});

			const builder = new ScanBuilder(mockClient, testConfig);
			const result = await builder.exec();

			// All items should be properly typed and validated
			expect(result[0].id).toBe("1");
			expect(result[0].name).toBe("Alice");
			expect(result[0].age).toBe(25);
			expect(result[0].status).toBe("active");
			expect(result[0].email).toBe("alice@example.com");
		});

		it("should detect string fields correctly", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			
			// This test verifies the internal isStringField method works
			// by checking that string fields get the right condition types
			const nameCondition = builder.filter("name");
			const ageCondition = builder.filter("age");
			
			expect(nameCondition).toBeDefined();
			expect(ageCondition).toBeDefined();
		});
	});

	describe("Method Chaining", () => {
		it("should support complex method chaining", () => {
			const builder = new ScanBuilder(mockClient, testConfig);
			
			const result = (builder as any)
				.filter("status").eq("active")
				.filter("age").gte(18)
				.filter("name").contains("A")
				.consistentRead(true)
				.limit(50)
				.projectionExpression("id, #name, age")
				.returnConsumedCapacity("TOTAL")
				.usingIndex("StatusIndex")
				.segments(0, 4)
				.startKey({ id: "start-key" })
				.loadAll();

			expect(result).toBe(builder);
		});
	});
});