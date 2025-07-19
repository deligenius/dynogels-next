#!/usr/bin/env tsx

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { Model } from "../Model.js";
import { ModelFactory } from "../ModelFactory.js";
import { TableManager } from "../TableManager.js";

// Example schema for demonstration
const userSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	name: z.string(),
	age: z.number().min(0).max(120),
	status: z.enum(["active", "inactive", "pending"]),
	tags: z.array(z.string()).optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// Product schema for more complex examples
const productSchema = z.object({
	productId: z.string(),
	category: z.string(),
	name: z.string(),
	price: z.number().min(0),
	inStock: z.boolean(),
	tags: z.array(z.string()),
	description: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

type User = z.infer<typeof userSchema>;
type Product = z.infer<typeof productSchema>;

async function main() {
	console.log("🔍 ScanBuilder Demo - Comprehensive Examples");
	console.log("=".repeat(50));

	// Initialize AWS SDK and factory
	const client = new DynamoDBClient({
		region: "us-east-1",
		endpoint: "http://localhost:8000", // DynamoDB Local
		credentials: {
			accessKeyId: "dummy",
			secretAccessKey: "dummy",
		},
	});

	const factory = new ModelFactory(client);
	const tableManager = new TableManager(client);

	// Define models with comprehensive configurations
	const User = factory.defineModel({
		hashKey: "id",
		schema: userSchema,
		tableName: "scan-demo-users",
		timestamps: { createdAt: true, updatedAt: true },
		globalSecondaryIndexes: {
			StatusIndex: {
				hashKey: "status",
				projectionType: "ALL",
			},
			EmailIndex: {
				hashKey: "email",
				projectionType: "ALL",
			},
		},
	});

	const Product = factory.defineModel({
		hashKey: "productId",
		rangeKey: "category",
		schema: productSchema,
		tableName: "scan-demo-products",
		timestamps: { createdAt: true, updatedAt: true },
		globalSecondaryIndexes: {
			CategoryIndex: {
				hashKey: "category",
				projectionType: "ALL",
			},
			PriceIndex: {
				hashKey: "inStock",
				rangeKey: "price",
				projectionType: "ALL",
			},
		},
	});

	try {
		// Setup: Create tables and sample data
		await setupDemo(tableManager, User, Product);

		console.log("\n📋 Basic Scan Examples");
		console.log("-".repeat(30));
		await basicScanExamples(User, Product);

		console.log("\n🔍 Filter Scan Examples");
		console.log("-".repeat(30));
		await filterScanExamples(User, Product);

		console.log("\n📊 Advanced Scan Features");
		console.log("-".repeat(30));
		await advancedScanExamples(User, Product);

		console.log("\n⚡ Parallel Scan Examples");
		console.log("-".repeat(30));
		await parallelScanExamples(User);

		console.log("\n🔄 Pagination & Streaming Examples");
		console.log("-".repeat(30));
		await paginationExamples(User);

		console.log("\n🏗️ Index Scan Examples");
		console.log("-".repeat(30));
		await indexScanExamples(User, Product);

		console.log("\n✅ ScanBuilder Demo completed successfully!");

	} catch (error) {
		console.error("❌ Demo failed:", error);
		process.exit(1);
	} finally {
		// Cleanup: Delete tables
		try {
			await tableManager.deleteTable("scan-demo-users");
			await tableManager.deleteTable("scan-demo-products");
			console.log("🗑️ Cleanup completed");
		} catch (error) {
			console.warn("⚠️ Cleanup warning:", error);
		}
	}
}

async function setupDemo(tableManager: TableManager, User: Model<any, any, any, any>, Product: Model<any, any, any, any>) {
	console.log("🔧 Setting up demo tables and data...");

	// Create tables
	await tableManager.createTable(User, { read: 5, write: 5 });
	await tableManager.createTable(Product, { read: 5, write: 5 });

	// Create sample users
	const users: Omit<User, "createdAt" | "updatedAt">[] = [
		{ id: "user-1", email: "alice@example.com", name: "Alice Johnson", age: 28, status: "active", tags: ["premium", "beta"] },
		{ id: "user-2", email: "bob@example.com", name: "Bob Smith", age: 35, status: "active", tags: ["standard"] },
		{ id: "user-3", email: "charlie@example.com", name: "Charlie Brown", age: 22, status: "pending", tags: ["new"] },
		{ id: "user-4", email: "diana@example.com", name: "Diana Prince", age: 30, status: "inactive", tags: ["premium"] },
		{ id: "user-5", email: "eve@example.com", name: "Eve Wilson", age: 45, status: "active", tags: ["enterprise", "beta"] },
	];

	for (const userData of users) {
		await User.create(userData);
	}

	// Create sample products
	const products: Omit<Product, "createdAt" | "updatedAt">[] = [
		{ productId: "prod-1", category: "electronics", name: "iPhone 15", price: 999, inStock: true, tags: ["apple", "phone", "5g"], description: "Latest iPhone" },
		{ productId: "prod-2", category: "electronics", name: "MacBook Pro", price: 2499, inStock: true, tags: ["apple", "laptop", "m3"], description: "Professional laptop" },
		{ productId: "prod-3", category: "books", name: "TypeScript Handbook", price: 29.99, inStock: false, tags: ["programming", "typescript"], description: "Learn TypeScript" },
		{ productId: "prod-4", category: "electronics", name: "AirPods Pro", price: 249, inStock: true, tags: ["apple", "audio", "wireless"] },
		{ productId: "prod-5", category: "books", name: "AWS Cloud Guide", price: 39.99, inStock: true, tags: ["aws", "cloud", "devops"] },
	];

	for (const productData of products) {
		await Product.create(productData);
	}

	console.log(`✅ Created ${users.length} users and ${products.length} products`);
}

async function basicScanExamples(User: Model<any, any, any, any>, Product: Model<any, any, any, any>) {
	console.log("1. Basic table scan (all users):");
	const allUsers = await User.scan().exec();
	console.log(`   Found ${allUsers.length} users total`);

	console.log("\n2. Basic scan with limit:");
	const limitedUsers = await User.scan().limit(3).exec();
	console.log(`   Found ${limitedUsers.length} users (limited to 3)`);

	console.log("\n3. Scan all products:");
	const allProducts = await Product.scan().exec();
	console.log(`   Found ${allProducts.length} products total`);
}

async function filterScanExamples(User: Model<any, any, any, any>, Product: Model<any, any, any, any>) {
	console.log("1. Filter by status (active users):");
	const activeUsers = await User.scan()
		.filter("status").eq("active")
		.exec();
	console.log(`   Found ${activeUsers.length} active users`);

	console.log("\n2. Filter by age range:");
	const youngAdults = await User.scan()
		.filter("age").between(25, 35)
		.exec();
	console.log(`   Found ${youngAdults.length} users aged 25-35`);

	console.log("\n3. String operations - name contains:");
	const johnsons = await (User.scan() as any)
		.filter("name").contains("Johnson")
		.exec();
	console.log(`   Found ${johnsons.length} users with 'Johnson' in name`);

	console.log("\n4. Multiple filters - active young adults:");
	const activeYoung = await User.scan()
		.filter("status").eq("active")
		.filter("age").lt(30)
		.exec();
	console.log(`   Found ${activeYoung.length} active users under 30`);

	console.log("\n5. Product filters - electronics under $300:");
	const affordableElectronics = await Product.scan()
		.filter("category").eq("electronics")
		.filter("price").lt(300)
		.exec();
	console.log(`   Found ${affordableElectronics.length} affordable electronics`);

	console.log("\n6. String filters - product name begins with:");
	const appleProducts = await Product.scan()
		.filter("name").beginsWith("iPhone")
		.exec();
	console.log(`   Found ${appleProducts.length} iPhone products`);

	console.log("\n7. Array contains filter:");
	const betaUsers = await (User.scan() as any)
		.filter("tags").contains("beta")
		.exec();
	console.log(`   Found ${betaUsers.length} beta users`);
}

async function advancedScanExamples(User: Model<any, any, any, any>, Product: Model<any, any, any, any>) {
	console.log("1. Scan with projection (name and email only):");
	const userEmails = await User.scan()
		.projectionExpression("id, #name, email")
		.filter("status").eq("active")
		.exec();
	console.log(`   Retrieved ${userEmails.length} user profiles (projected fields)`);

	console.log("\n2. Consistent read scan:");
	const consistentUsers = await User.scan()
		.consistentRead(true)
		.filter("age").gte(30)
		.exec();
	console.log(`   Found ${consistentUsers.length} users aged 30+ (consistent read)`);

	console.log("\n3. Scan with capacity consumption tracking:");
	const result = await User.scan()
		.filter("status").eq("active")
		.returnConsumedCapacity("TOTAL")
		.execWithPagination();
	console.log(`   Found ${result.items.length} items, scanned ${result.scannedCount} items`);
	console.log(`   Consumed capacity: ${result.consumedCapacity}`);

	console.log("\n4. Load all pages automatically:");
	const allActiveUsers = await User.scan()
		.filter("status").eq("active")
		.loadAll()
		.exec();
	console.log(`   Loaded all ${allActiveUsers.length} active users across all pages`);
}

async function parallelScanExamples(User: any) {
	console.log("1. Parallel scan with 2 segments:");

	const segment0Promise = User.scan()
		.segments(0, 2)
		.filter("status").eq("active")
		.exec();

	const segment1Promise = User.scan()
		.segments(1, 2)
		.filter("status").eq("active")
		.exec();

	const [segment0Results, segment1Results] = await Promise.all([
		segment0Promise,
		segment1Promise,
	]);

	const totalResults = [...segment0Results, ...segment1Results];
	console.log(`   Segment 0: ${segment0Results.length} items`);
	console.log(`   Segment 1: ${segment1Results.length} items`);
	console.log(`   Total: ${totalResults.length} active users from parallel scan`);

	console.log("\n2. Parallel scan utility function:");
	const parallelResults = await parallelScan(User, 3, (scan) =>
		scan.filter("age").gte(25)
	);
	console.log(`   Found ${parallelResults.length} users aged 25+ using 3 parallel segments`);
}

async function paginationExamples(User: any) {
	console.log("1. Manual pagination:");
	let lastKey: Record<string, any> | undefined = undefined;
	let pageCount = 0;
	let totalItems = 0;

	do {
		const page: any = await User.scan()
			.filter("status").eq("active")
			.startKey(lastKey)
			.limit(2)
			.execWithPagination();

		pageCount++;
		totalItems += page.items.length;
		lastKey = page.lastEvaluatedKey;

		console.log(`   Page ${pageCount}: ${page.items.length} items`);
	} while (lastKey);

	console.log(`   Total: ${totalItems} items across ${pageCount} pages`);

	console.log("\n2. Streaming large results:");
	let batchCount = 0;
	let streamTotal = 0;

	for await (const batch of User.scan().filter("age").gte(20).stream()) {
		batchCount++;
		streamTotal += batch.length;
		console.log(`   Batch ${batchCount}: ${batch.length} items`);
	}

	console.log(`   Streamed ${streamTotal} total items in ${batchCount} batches`);
}

async function indexScanExamples(User: any, Product: any) {
	console.log("1. Scan Global Secondary Index (StatusIndex):");
	const activeUsersFromIndex = await User.scan()
		.usingIndex("StatusIndex")
		.filter("status").eq("active")
		.exec();
	console.log(`   Found ${activeUsersFromIndex.length} active users via StatusIndex`);

	console.log("\n2. Scan Product CategoryIndex:");
	const electronicsFromIndex = await Product.scan()
		.usingIndex("CategoryIndex")
		.filter("category").eq("electronics")
		.exec();
	console.log(`   Found ${electronicsFromIndex.length} electronics via CategoryIndex`);

	console.log("\n3. Complex index scan with multiple filters:");
	const premiumUsers = await User.scan()
		.usingIndex("StatusIndex")
		.filter("status").eq("active")
		.filter("tags").contains("premium")
		.exec();
	console.log(`   Found ${premiumUsers.length} premium active users`);
}

// Helper function for parallel scanning
async function parallelScan<T>(
	model: any,
	totalSegments: number,
	filterBuilder?: (scan: any) => any,
): Promise<T[]> {
	const segments = Array.from({ length: totalSegments }, (_, i) => i);

	const scanPromises = segments.map((segment) => {
		let scanBuilder = model.scan().segments(segment, totalSegments);

		if (filterBuilder) {
			scanBuilder = filterBuilder(scanBuilder);
		}

		return scanBuilder.exec();
	});

	const results = await Promise.all(scanPromises);
	return results.flat();
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n⏹️ Demo interrupted by user");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n⏹️ Demo terminated");
	process.exit(0);
});

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("💥 Demo crashed:", error);
		process.exit(1);
	});
}