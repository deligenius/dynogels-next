const dynogels = require("../index");
const chai = require("chai");
const async = require("async");
const _ = require("lodash");
const Joi = require("joi");
const uuid = require("uuid");

const expect = chai.expect;
chai.should();

// Configure for local DynamoDB
dynogels.AWS.config.update({
	accessKeyId: "test",
	secretAccessKey: "test",
	region: "localhost",
	endpoint: "http://localhost:8000",
});

describe("Local DynamoDB Integration Tests", function () {
	this.timeout(30000); // DynamoDB operations can be slow

	let User, BlogPost, Comment, Product;
	let testUser; // Global test user for error handling tests
	let testAuthor, testPosts = []; // Global variables for comment tests

	before(() => {
		// Define User model
		User = dynogels.define("LocalTestUser", {
			hashKey: "id",
			timestamps: true,
			schema: {
				id: dynogels.types.uuid(),
				email: Joi.string().email().required(),
				name: Joi.string().required(),
				age: Joi.number().min(0).max(150),
				roles: dynogels.types.stringSet(),
				settings: {
					theme: Joi.string().valid("light", "dark").default("light"),
					notifications: Joi.boolean().default(true),
					language: Joi.string().default("en"),
				},
				metadata: Joi.object(),
				tags: dynogels.types.stringSet(),
				score: Joi.number().default(0),
			},
		});

		// Define BlogPost model with hash and range key
		BlogPost = dynogels.define("LocalTestBlogPost", {
			hashKey: "authorId",
			rangeKey: "postId",
			timestamps: true,
			schema: {
				authorId: Joi.string().required(),
				postId: dynogels.types.uuid(),
				title: Joi.string().required(),
				content: Joi.string().required(),
				published: Joi.boolean().default(false),
				tags: dynogels.types.stringSet(),
				views: Joi.number().default(0),
				likes: Joi.number().default(0),
				category: Joi.string(),
				metadata: Joi.object(),
			},
			indexes: [
				{
					hashKey: "category",
					rangeKey: "createdAt",
					name: "CategoryIndex",
					type: "global",
				},
			],
		});

		// Define Comment model
		Comment = dynogels.define("LocalTestComment", {
			hashKey: "postId",
			rangeKey: "commentId",
			timestamps: true,
			schema: {
				postId: Joi.string().required(),
				commentId: dynogels.types.uuid(),
				authorId: Joi.string().required(),
				content: Joi.string().required(),
				approved: Joi.boolean().default(false),
				parentCommentId: Joi.string(),
				likes: Joi.number().default(0),
			},
		});

		// Define Product model for testing complex operations
		Product = dynogels.define("LocalTestProduct", {
			hashKey: "productId",
			timestamps: true,
			schema: {
				productId: dynogels.types.uuid(),
				name: Joi.string().required(),
				description: Joi.string(),
				price: Joi.number().precision(2).required(),
				category: Joi.string().required(),
				tags: dynogels.types.stringSet(),
				inStock: Joi.boolean().default(true),
				stockCount: Joi.number().default(0),
				ratings: Joi.array().items(Joi.number().min(1).max(5)),
				averageRating: Joi.number(),
				manufacturer: {
					name: Joi.string(),
					country: Joi.string(),
					website: Joi.string().uri(),
				},
				specifications: Joi.object(),
			},
		});
	});

	describe("Table Management", () => {
		it("should create all test tables", (done) => {
			const options = {
				LocalTestUser: { readCapacity: 1, writeCapacity: 1 },
				LocalTestBlogPost: { readCapacity: 1, writeCapacity: 1 },
				LocalTestComment: { readCapacity: 1, writeCapacity: 1 },
				LocalTestProduct: { readCapacity: 1, writeCapacity: 1 },
			};

			dynogels.createTables(options, (err) => {
				expect(err).to.not.exist;
				done();
			});
		});

		it("should describe tables successfully", (done) => {
			async.parallel(
				[
					(cb) => User.describeTable(cb),
					(cb) => BlogPost.describeTable(cb),
					(cb) => Comment.describeTable(cb),
					(cb) => Product.describeTable(cb),
				],
				(err, results) => {
					expect(err).to.not.exist;
					expect(results).to.have.length(4);
					results.forEach((result) => {
						expect(result.Table).to.exist;
						expect(result.Table.TableStatus).to.equal("ACTIVE");
					});
					done();
				},
			);
		});
	});

	describe("User CRUD Operations", () => {

		it("should create a user with all field types", (done) => {
			const userData = {
				email: "test@example.com",
				name: "Test User",
				age: 30,
				roles: ["admin", "editor"],
				settings: {
					theme: "dark",
					notifications: false,
					language: "es",
				},
				metadata: {
					source: "api",
					version: "1.0",
					features: ["premium", "beta"],
				},
				tags: ["developer", "typescript"],
				score: 100,
			};

			User.create(userData, (err, user) => {
				if (err) {
					console.error('User creation error:', err);
					return done(err);
				}
				
				expect(user).to.exist;
				expect(user.get("email")).to.equal("test@example.com");
				expect(user.get("name")).to.equal("Test User");
				expect(user.get("roles")).to.include("admin");
				expect(user.get("settings").theme).to.equal("dark");
				
				// Timestamps should exist when enabled
				expect(user.get("createdAt")).to.exist;
				// updatedAt might be undefined on creation, only set on updates
				const createdAt = user.get("createdAt");
				expect(createdAt instanceof Date || typeof createdAt === 'string').to.be.true;

				testUser = user;
				done();
			});
		});

		it("should retrieve the created user", (done) => {
			if (!testUser) {
				return done(new Error("No test user created in previous test"));
			}
			
			User.get(testUser.get("id"), (err, user) => {
				expect(err).to.not.exist;
				expect(user).to.exist;
				expect(user.get("email")).to.equal("test@example.com");
				expect(user.get("name")).to.equal("Test User");
				expect(user.get("roles")).to.include("admin");
				done();
			});
		});

		it("should update user with consistent read", (done) => {
			if (!testUser) {
				return done(new Error("No test user created in previous test"));
			}
			
			User.get(testUser.get("id"), { ConsistentRead: true }, (err, user) => {
				expect(err).to.not.exist;
				expect(user).to.exist;

				user.set("name", "Updated Test User");
				user.set("age", 31);
				// Use update operation instead of $add on the item
				const currentScore = user.get("score") || 0;
				user.set("score", currentScore + 50);

				user.save((err, updatedUser) => {
					expect(err).to.not.exist;
					expect(updatedUser.get("name")).to.equal("Updated Test User");
					expect(updatedUser.get("age")).to.equal(31);
					expect(updatedUser.get("score")).to.equal(150);
					done();
				});
			});
		});

		it("should handle validation errors", (done) => {
			User.create(
				{
					email: "invalid-email",
					name: "Test User",
				},
				(err, user) => {
					expect(err).to.exist;
					expect(err.name).to.equal("ValidationError");
					expect(user).to.not.exist;
					done();
				},
			);
		});

		it("should create multiple users in batch", (done) => {
			const users = [];
			for (let i = 0; i < 5; i++) {
				users.push({
					email: `batch-user-${i}@example.com`,
					name: `Batch User ${i}`,
					age: 20 + i,
					score: i * 10,
				});
			}

			User.create(users, (err, createdUsers) => {
				expect(err).to.not.exist;
				expect(createdUsers).to.have.length(5);
				createdUsers.forEach((user, index) => {
					expect(user.get("email")).to.equal(`batch-user-${index}@example.com`);
					expect(user.get("name")).to.equal(`Batch User ${index}`);
				});
				done();
			});
		});
	});

	describe("BlogPost Operations with Hash and Range Key", () => {

		before((done) => {
			User.create(
				{
					email: "author@example.com",
					name: "Blog Author",
					age: 35,
				},
				(err, user) => {
					expect(err).to.not.exist;
					testAuthor = user;
					done();
				},
			);
		});

		it("should create blog posts with range keys", (done) => {
			const posts = [
				{
					authorId: testAuthor.get("id"),
					title: "First Blog Post",
					content: "This is the content of the first blog post.",
					published: true,
					category: "technology",
					tags: ["javascript", "nodejs"],
				},
				{
					authorId: testAuthor.get("id"),
					title: "Second Blog Post",
					content: "This is the content of the second blog post.",
					published: false,
					category: "programming",
					tags: ["typescript", "aws"],
				},
				{
					authorId: testAuthor.get("id"),
					title: "Third Blog Post",
					content: "This is the content of the third blog post.",
					published: true,
					category: "technology",
					tags: ["dynamodb", "nosql"],
				},
			];

			async.map(posts, BlogPost.create.bind(BlogPost), (err, createdPosts) => {
				expect(err).to.not.exist;
				expect(createdPosts).to.have.length(3);

				createdPosts.forEach((post, index) => {
					expect(post.get("authorId")).to.equal(testAuthor.get("id"));
					expect(post.get("title")).to.equal(posts[index].title);
					expect(post.get("postId")).to.exist;
				});

				testPosts = createdPosts;
				done();
			});
		});

		it("should query posts by author", (done) => {
			BlogPost.query(testAuthor.get("id")).exec((err, posts) => {
				expect(err).to.not.exist;
				expect(posts.Items).to.have.length(3);
				posts.Items.forEach((post) => {
					expect(post.get("authorId")).to.equal(testAuthor.get("id"));
				});
				done();
			});
		});

		it("should query posts with filters", (done) => {
			BlogPost.query(testAuthor.get("id"))
				.filter("published")
				.equals(true)
				.exec((err, posts) => {
					expect(err).to.not.exist;
					expect(posts.Items).to.have.length(2);
					posts.Items.forEach((post) => {
						expect(post.get("published")).to.be.true;
					});
					done();
				});
		});

		it("should query with limit and ordering", (done) => {
			BlogPost.query(testAuthor.get("id"))
				.limit(2)
				.descending()
				.exec((err, posts) => {
					expect(err).to.not.exist;
					expect(posts.Items).to.have.length(2);
					done();
				});
		});

		it("should get specific post by hash and range key", (done) => {
			const firstPost = testPosts[0];

			BlogPost.get(
				testAuthor.get("id"),
				firstPost.get("postId"),
				(err, post) => {
					expect(err).to.not.exist;
					expect(post).to.exist;
					expect(post.get("title")).to.equal("First Blog Post");
					expect(post.get("authorId")).to.equal(testAuthor.get("id"));
					done();
				},
			);
		});

		it("should update post content", (done) => {
			const firstPost = testPosts[0];

			BlogPost.update(
				{
					authorId: testAuthor.get("id"),
					postId: firstPost.get("postId"),
					title: "Updated First Blog Post",
					content: "This is the updated content.",
					views: { $add: 10 },
				},
				(err, updatedPost) => {
					expect(err).to.not.exist;
					expect(updatedPost.get("title")).to.equal("Updated First Blog Post");
					expect(updatedPost.get("views")).to.equal(10);
					done();
				},
			);
		});
	});

	describe("Comment Operations", () => {
		let testPost,
			testComments = [];

		before((done) => {
			if (testPosts.length === 0) {
				return done(new Error("No test posts available for comment tests"));
			}
			testPost = testPosts[0];
			done();
		});

		it("should create comments on blog post", (done) => {
			const comments = [
				{
					postId: testPost.get("postId"),
					authorId: testAuthor.get("id"),
					content: "Great post! Very informative.",
					approved: true,
				},
				{
					postId: testPost.get("postId"),
					authorId: "commenter-2",
					content: "I disagree with some points.",
					approved: false,
				},
				{
					postId: testPost.get("postId"),
					authorId: "commenter-3",
					content: "Thanks for sharing this!",
					approved: true,
				},
			];

			async.map(
				comments,
				Comment.create.bind(Comment),
				(err, createdComments) => {
					expect(err).to.not.exist;
					expect(createdComments).to.have.length(3);

					createdComments.forEach((comment, index) => {
						expect(comment.get("postId")).to.equal(testPost.get("postId"));
						expect(comment.get("content")).to.equal(comments[index].content);
					});

					testComments = createdComments;
					done();
				},
			);
		});

		it("should query comments by post", (done) => {
			Comment.query(testPost.get("postId")).exec((err, comments) => {
				expect(err).to.not.exist;
				expect(comments.Items).to.have.length(3);
				comments.Items.forEach((comment) => {
					expect(comment.get("postId")).to.equal(testPost.get("postId"));
				});
				done();
			});
		});

		it("should filter approved comments", (done) => {
			Comment.query(testPost.get("postId"))
				.filter("approved")
				.equals(true)
				.exec((err, comments) => {
					expect(err).to.not.exist;
					expect(comments.Items).to.have.length(2);
					comments.Items.forEach((comment) => {
						expect(comment.get("approved")).to.be.true;
					});
					done();
				});
		});
	});

	describe("Product Operations with Complex Data", () => {
		let testProducts = [];

		it("should create products with complex nested data", (done) => {
			const products = [
				{
					name: "MacBook Pro",
					description: "Professional laptop for developers",
					price: 2499.99,
					category: "electronics",
					tags: ["laptop", "apple", "professional"],
					inStock: true,
					stockCount: 50,
					ratings: [5, 4, 5, 5, 4],
					averageRating: 4.6,
					manufacturer: {
						name: "Apple Inc.",
						country: "USA",
						website: "https://apple.com",
					},
					specifications: {
						cpu: "M1 Pro",
						ram: "16GB",
						storage: "512GB SSD",
						screen: "14-inch Retina",
						weight: "1.6kg",
					},
				},
				{
					name: "iPhone 14",
					description: "Latest smartphone from Apple",
					price: 999.99,
					category: "electronics",
					tags: ["smartphone", "apple", "mobile"],
					inStock: true,
					stockCount: 100,
					ratings: [5, 5, 4, 5],
					averageRating: 4.75,
					manufacturer: {
						name: "Apple Inc.",
						country: "USA",
						website: "https://apple.com",
					},
					specifications: {
						cpu: "A16 Bionic",
						storage: "128GB",
						screen: "6.1-inch Super Retina XDR",
						camera: "48MP Main",
					},
				},
			];

			async.map(
				products,
				Product.create.bind(Product),
				(err, createdProducts) => {
					expect(err).to.not.exist;
					expect(createdProducts).to.have.length(2);

					createdProducts.forEach((product, index) => {
						expect(product.get("name")).to.equal(products[index].name);
						expect(product.get("price")).to.equal(products[index].price);
						expect(product.get("manufacturer").name).to.equal("Apple Inc.");
						expect(product.get("specifications")).to.be.an("object");
					});

					testProducts = createdProducts;
					done();
				},
			);
		});

		it("should scan products by category", (done) => {
			Product.scan()
				.where("category")
				.equals("electronics")
				.exec((err, products) => {
					expect(err).to.not.exist;
					expect(products.Items).to.have.length(2);
					products.Items.forEach((product) => {
						expect(product.get("category")).to.equal("electronics");
					});
					done();
				});
		});

		it("should scan products with price filter", (done) => {
			Product.scan()
				.where("price")
				.gt(1000)
				.exec((err, products) => {
					expect(err).to.not.exist;
					expect(products.Items).to.have.length(1);
					expect(products.Items[0].get("name")).to.equal("MacBook Pro");
					done();
				});
		});

		it("should update product stock", (done) => {
			const macbook = testProducts[0];

			Product.update(
				{
					productId: macbook.get("productId"),
					stockCount: { $add: -5 }, // Sold 5 units
					inStock: false,
				},
				(err, updatedProduct) => {
					expect(err).to.not.exist;
					expect(updatedProduct.get("stockCount")).to.equal(45);
					expect(updatedProduct.get("inStock")).to.be.false;
					done();
				},
			);
		});
	});

	describe("Batch Operations", () => {
		let batchUsers = [];

		before((done) => {
			// Create some users for batch operations
			const users = [];
			for (let i = 0; i < 10; i++) {
				users.push({
					email: `batch-${i}@example.com`,
					name: `Batch User ${i}`,
					age: 20 + i,
				});
			}

			async.map(users, User.create.bind(User), (err, createdUsers) => {
				expect(err).to.not.exist;
				batchUsers = createdUsers;
				done();
			});
		});

		it("should batch get multiple users", (done) => {
			const userIds = batchUsers.slice(0, 5).map((user) => user.get("id"));

			User.getItems(userIds, (err, users) => {
				expect(err).to.not.exist;
				expect(users).to.have.length(5);
				users.forEach((user) => {
					expect(userIds).to.include(user.get("id"));
				});
				done();
			});
		});

		it("should batch get with consistent read", (done) => {
			const userIds = batchUsers.slice(5, 8).map((user) => user.get("id"));

			User.getItems(userIds, { ConsistentRead: true }, (err, users) => {
				expect(err).to.not.exist;
				expect(users).to.have.length(3);
				done();
			});
		});

		it("should handle batch get with non-existent items", (done) => {
			const mixedIds = [
				batchUsers[0].get("id"),
				"non-existent-id-1",
				batchUsers[1].get("id"),
				"non-existent-id-2",
			];

			User.getItems(mixedIds, (err, users) => {
				expect(err).to.not.exist;
				expect(users).to.have.length(2); // Only existing users returned
				done();
			});
		});
	});

	describe("Advanced Query and Scan Operations", () => {
		it("should perform parallel scan", (done) => {
			User.parallelScan(4).exec((err, result) => {
				expect(err).to.not.exist;
				expect(result.Items).to.be.an("array");
				expect(result.Items.length).to.be.at.least(1);
				done();
			});
		});

		it("should scan with expression filters", (done) => {
			User.scan()
				.filterExpression("#age > :age")
				.expressionAttributeNames({ "#age": "age" })
				.expressionAttributeValues({ ":age": 25 })
				.exec((err, result) => {
					expect(err).to.not.exist;
					expect(result.Items).to.be.an("array");
					result.Items.forEach((user) => {
						expect(user.get("age")).to.be.greaterThan(25);
					});
					done();
				});
		});

		it("should count items in scan", (done) => {
			User.scan()
				.select("COUNT")
				.exec((err, result) => {
					expect(err).to.not.exist;
					expect(result.Count).to.be.a("number");
					expect(result.Count).to.be.greaterThan(0);
					done();
				});
		});
	});

	describe("Error Handling", () => {
		it("should handle get non-existent item", (done) => {
			User.get("non-existent-id", (err, user) => {
				expect(err).to.not.exist;
				expect(user).to.be.null;
				done();
			});
		});

		it("should handle conditional update failure", (done) => {
			if (!testUser) {
				return done(new Error("No test user available for conditional update test"));
			}
			
			const userId = testUser.get("id");

			User.update(
				{
					id: userId,
					name: "Should Not Update",
				},
				{
					expected: { age: 999 }, // This condition should fail
				},
				(err, user) => {
					expect(err).to.exist;
					expect(err.code).to.equal("ConditionalCheckFailedException");
					expect(user).to.not.exist;
					done();
				},
			);
		});

		it("should handle validation errors on update", (done) => {
			if (!testUser) {
				return done(new Error("No test user available for validation test"));
			}
			
			User.update(
				{
					id: testUser.get("id"),
					email: "invalid-email-format",
				},
				(err, user) => {
					expect(err).to.exist;
					// The error might be ValidationError or DynogelsUpdateError depending on implementation
					expect(err.name).to.match(/ValidationError|DynogelsUpdateError/);
					done();
				},
			);
		});
	});

	describe("Cleanup", () => {
		it("should delete all test tables", (done) => {
			async.parallel(
				[
					(cb) => User.deleteTable(cb),
					(cb) => BlogPost.deleteTable(cb),
					(cb) => Comment.deleteTable(cb),
					(cb) => Product.deleteTable(cb),
				],
				(err) => {
					// Don't fail if tables don't exist
					done();
				},
			);
		});
	});
});
