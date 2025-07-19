/**
 * Demo application showcasing the new Model system
 * This file demonstrates all CRUD operations and library initialization
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { z } from "zod";
import { ModelFactory, TableManager } from "../index.js";

// Define user schema with timestamps
const userSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	name: z.string(),
	age: z.number().optional(),
	status: z.enum(["active", "inactive"]).default("active"),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// Define product schema without timestamps
const productSchema = z.object({
	productId: z.string(),
	category: z.string(),
	name: z.string(),
	price: z.number(),
	description: z.string().optional(),
});

async function main() {
	console.log("🚀 Starting Model System Demo\n");

	// 1. Initialize AWS clients and factory
	console.log("1. Initializing AWS clients...");
	const dynamoClient = new DynamoDBClient({
		region: "us-east-1",
		endpoint: "http://localhost:8000", // For DynamoDB Local
	});

	const factory = new ModelFactory(dynamoClient);
	const tableManager = new TableManager(dynamoClient);

	// 2. Define models with different configurations
	console.log("2. Defining models...");

	// User model with timestamps
	const User = factory.defineModel({
		hashKey: "id",
		schema: userSchema,
		tableName: "users",
		timestamps: {
			createdAt: true,
			updatedAt: true,
		},
	});

	// Product model with composite key (no timestamps)
	const Product = factory.defineModel({
		hashKey: "productId",
		rangeKey: "category",
		schema: productSchema,
		tableName: "products",
	});

	try {
		// 3. Create tables using models
		console.log("3. Creating tables...");

		if (await tableManager.tableExists(User.config.tableName)) {
			await tableManager.deleteTable(User.config.tableName);
			console.log("🗑️ Users table deleted");
		}

		if (await tableManager.tableExists(Product.config.tableName)) {
			await tableManager.deleteTable(Product.config.tableName);
			console.log("🗑️ Products table deleted");
		}

		// Create User table using model directly
		await tableManager.createTable(User, { read: 5, write: 5 });
		console.log("✅ Users table created");
		// Create Product table using model directly
		await tableManager.createTable(Product, { read: 3, write: 3 });
		console.log("✅ Products table created");

		// 4. Demonstrate CRUD operations for User model
		console.log("\n4. User Model CRUD Operations:");

		// CREATE operations
		console.log("\n📝 Creating users...");
		const user1 = await User.create({
			id: "user-1",
			email: "john@example.com",
			name: "John Doe",
			age: 30,
			status: "active",
			
		});
		console.log("Created user1:", user1);

		const user2 = await User.create({
			id: "user-2",
			email: "jane@example.com",
			name: "Jane Smith",
			age: 25,
			status: "active",
		});
		console.log("Created user2:", user2);

		const user3 = await User.create({
			id: "user-3",
			email: "bob@example.com",
			name: "Bob Wilson",
			age: 35,
			status: "inactive",
		});
		console.log("Created user3:", user3);

		// GET operation - this should only require { id: 'user-1' }
		console.log("\n🔍 Getting single user...");
		const retrievedUser = await User.get({ id: "user-1" });
		console.log("Retrieved user:", retrievedUser);

		// GET with consistent read
		console.log("\n🔍 Getting user with consistent read...");
		const consistentUser = await User.get(
			{ id: "user-2" },
			{ consistentRead: true },
		);
		console.log("Retrieved user (consistent):", consistentUser);

		// GET non-existent user
		console.log("\n🔍 Getting non-existent user...");
		const nonExistentUser = await User.get({ id: "user-999" });
		console.log("Non-existent user result:", nonExistentUser);

		// BATCH GET operation (getMany)
		console.log("\n📦 Batch getting multiple users...");
		const batchUsers = await User.getMany([
			{ id: "user-1" },
			{ id: "user-2" },
			{ id: "user-3" },
			{ id: "user-999" }, // This one doesn't exist
		]);
		console.log(`Retrieved ${batchUsers.length} users from batch:`, batchUsers);

		// UPDATE operation
		console.log("\n✏️ Updating user...");
		const updatedUser = await User.update(
			{ id: "user-1" },
			{ age: 31, status: "inactive" },
		);
		console.log("Updated user:", updatedUser);

		// 5. Demonstrate composite key operations with Product model
		console.log("\n5. Product Model (Composite Key) Operations:");

		// CREATE products with composite keys
		console.log("\n📝 Creating products...");
		const product1 = await Product.create({
			productId: "prod-1",
			category: "electronics",
			name: "Smartphone",
			price: 699.99,
			description: "Latest smartphone model",
		});
		console.log("Created product1:", product1);

		const product2 = await Product.create({
			productId: "prod-1", // Same product ID, different category
			category: "accessories",
			name: "Phone Case",
			price: 19.99,
		});
		console.log("Created product2:", product2);

		const product3 = await Product.create({
			productId: "prod-2",
			category: "electronics",
			name: "Laptop",
			price: 1299.99,
			description: "High-performance laptop",
		});
		console.log("Created product3:", product3);

		// GET with composite key - should only require { productId: 'prod-1', category: 'electronics' }
		console.log("\n🔍 Getting product with composite key...");
		const retrievedProduct = await Product.get({
			productId: "prod-1",
			category: "electronics",
		});
		console.log("Retrieved product:", retrievedProduct);

		// BATCH GET with composite keys
		console.log("\n📦 Batch getting products...");
		const batchProducts = await Product.getMany([
			{ productId: "prod-1", category: "electronics" },
			{ productId: "prod-1", category: "accessories" },
			{ productId: "prod-2", category: "electronics" },
		]);
		console.log(`Retrieved ${batchProducts.length} products:`, batchProducts);

		// UPDATE product
		console.log("\n✏️ Updating product...");
		const updatedProduct = await Product.update(
			{ productId: "prod-1", category: "electronics" },
			{ price: 649.99, description: "Discounted smartphone" },
		);
		console.log("Updated product:", updatedProduct);

		// 6. Demonstrate DELETE operations
		console.log("\n6. Delete Operations:");

		// DELETE user
		console.log("\n🗑️ Deleting user...");
		const deletedUser = await User.destroy({ id: "user-3" });
		console.log("Deleted user:", deletedUser);

		// Try to get deleted user
		console.log("\n🔍 Checking if user was deleted...");
		const deletedUserCheck = await User.get({ id: "user-3" });
		console.log("Deleted user check result:", deletedUserCheck);

		// DELETE product
		console.log("\n🗑️ Deleting product...");
		const deletedProduct = await Product.destroy({
			productId: "prod-1",
			category: "accessories",
		});
		console.log("Deleted product:", deletedProduct);

		// 7. Error handling demonstrations
		console.log("\n7. Error Handling:");

		// Try to update non-existent user
		console.log("\n❌ Attempting to update non-existent user...");
		try {
			await User.update({ id: "user-999" }, { name: "Updated Name" });
		} catch (error) {
			console.log("Expected error caught:", (error as Error).message);
		}

		// Try to create user with duplicate ID
		console.log("\n❌ Attempting to create duplicate user...");
		try {
			await User.create({
				id: "user-1", // This ID already exists
				email: "duplicate@example.com",
				name: "Duplicate User",
				status: "active",
			});
		} catch (error) {
			console.log("Expected duplicate error caught:", (error as Error).message);
		}

		// 8. Table management operations
		console.log("\n8. Table Management:");

		// Check if table exists
		console.log("\n🔍 Checking if tables exist...");
		const usersTableExists = await tableManager.tableExists("users");
		const productsTableExists = await tableManager.tableExists("products");
		console.log(`Users table exists: ${usersTableExists}`);
		console.log(`Products table exists: ${productsTableExists}`);

		console.log("\n✅ Demo completed successfully!");
		console.log("\n📊 Summary:");
		console.log("- Created 2 models with different configurations");
		console.log("- Demonstrated all CRUD operations");
		console.log("- Showed batch operations (getMany)");
		console.log("- Tested composite keys");
		console.log("- Demonstrated error handling");
		console.log("- Showed table management features");
	} catch (error) {
		console.error("❌ Demo failed:", error);

		// Clean up tables on error
		try {
			console.log("\n🧹 Cleaning up tables...");
			await tableManager.deleteTable("users").catch(() => { });
			await tableManager.deleteTable("products").catch(() => { });
			console.log("✅ Tables cleaned up");
		} catch (cleanupError) {
			console.error("Failed to clean up tables:", cleanupError);
		}
	}
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
	console.log("\n🛑 Received SIGINT, cleaning up...");
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\n🛑 Received SIGTERM, cleaning up...");
	process.exit(0);
});

// Run the demo
if (import.meta.url === new URL(import.meta.url).href) {
	main().catch((error) => {
		console.error("💥 Unhandled error:", error);
		process.exit(1);
	});
}

export { main };
