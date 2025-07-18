/**
 * QueryBuilder Demo Application
 * This file demonstrates all QueryBuilder conditions and operators
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { z } from "zod";
import { ModelFactory, TableManager } from "./index.js";

// Define schemas for demonstration
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number(),
  status: z.enum(["active", "inactive", "pending"]),
  department: z.string(),
  score: z.number(),
  tags: z.array(z.string()),
  isVip: z.boolean(),
  lastLogin: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Composite key schema for advanced demos
const postSchema = z.object({
  userId: z.string(),
  postId: z.string(),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  views: z.number(),
  likes: z.number(),
  publishedAt: z.string(),
  featured: z.boolean(),
  tags: z.array(z.string()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

async function main() {
  console.log("🚀 Starting QueryBuilder Demo\n");

  // 1. Initialize AWS clients and factory
  console.log("1. Initializing AWS clients...");
  const dynamoClient = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000", // For DynamoDB Local
  });

  const factory = new ModelFactory(dynamoClient);
  const tableManager = new TableManager(dynamoClient);

  // 2. Define models
  console.log("2. Defining models...");

  const User = factory.defineModel({
    hashKey: "id",
    schema: userSchema,
    tableName: "demo-users",
    timestamps: { createdAt: true, updatedAt: true },
  });

  const Post = factory.defineModel({
    hashKey: "userId",
    rangeKey: "postId",
    schema: postSchema,
    tableName: "demo-posts",
    timestamps: { createdAt: true, updatedAt: true },
  });

  try {
    // 3. Create tables
    console.log("3. Creating tables...");

    // Clean up existing tables
    const userTableExists = await tableManager.tableExists("demo-users");
    if (userTableExists) {
      await tableManager.deleteTable("demo-users");
    }
    const postTableExists = await tableManager.tableExists("demo-posts");
    if (postTableExists) {
      await tableManager.deleteTable("demo-posts");
    }

    await tableManager.createTable(User, { read: 5, write: 5 });
    await tableManager.createTable(Post, { read: 5, write: 5 });
    console.log("✅ Tables created");

    // 4. Create sample data
    console.log("\n4. Creating sample data...");

    // Create users
    const users: z.infer<typeof userSchema>[] = [
      {
        id: "user1",
        email: "alice@company.com",
        name: "Alice Johnson",
        age: 28,
        status: "active" as const,
        department: "engineering",
        score: 95,
        tags: ["senior", "typescript", "react"],
        isVip: true,
        lastLogin: "2024-01-15T10:30:00Z",
      },
      {
        id: "user2",
        email: "bob@company.com",
        name: "Bob Smith",
        age: 32,
        status: "active" as const,
        department: "marketing",
        score: 87,
        tags: ["manager", "analytics"],
        isVip: false,
        lastLogin: "2024-01-14T09:15:00Z",
      },
      {
        id: "user3",
        email: "charlie@company.com",
        name: "Charlie Brown",
        age: 24,
        status: "pending" as const,
        department: "engineering",
        score: 72,
        tags: ["junior", "nodejs"],
        isVip: false,
        lastLogin: "2024-01-13T16:45:00Z",
      },
      {
        id: "user4",
        email: "diana@company.com",
        name: "Diana Prince",
        age: 35,
        status: "inactive" as const,
        department: "sales",
        score: 98,
        tags: ["expert", "sales", "lead"],
        isVip: true,
        lastLogin: "2024-01-10T08:20:00Z",
      },
      {
        id: "user5",
        email: "eve@company.com",
        name: "Eve Wilson",
        age: 29,
        status: "active" as const,
        department: "engineering",
        score: 91,
        tags: ["senior", "python", "ml"],
        isVip: true,
        lastLogin: "2024-01-16T11:00:00Z",
      },
    ];

    // Create posts
    const posts: z.infer<typeof postSchema>[] = [
      {
        userId: "user1",
        postId: "post1",
        title: "Getting Started with TypeScript",
        content: "TypeScript is a great language...",
        category: "technology",
        views: 1500,
        likes: 120,
        publishedAt: "2024-01-10T10:00:00Z",
        featured: true,
        tags: ["typescript", "programming", "tutorial"],
      },
      {
        userId: "user1",
        postId: "post2",
        title: "Advanced React Patterns",
        content: "React patterns for scalable applications...",
        category: "technology",
        views: 2300,
        likes: 180,
        publishedAt: "2024-01-12T14:30:00Z",
        featured: false,
        tags: ["react", "patterns", "advanced"],
      },
      {
        userId: "user2",
        postId: "post3",
        title: "Marketing Analytics Dashboard",
        content: "Building analytics dashboards...",
        category: "business",
        views: 890,
        likes: 65,
        publishedAt: "2024-01-08T09:15:00Z",
        featured: true,
        tags: ["analytics", "dashboard", "business"],
      },
      {
        userId: "user5",
        postId: "post4",
        title: "Machine Learning with Python",
        content: "ML fundamentals and practical applications...",
        category: "technology",
        views: 3200,
        likes: 245,
        publishedAt: "2024-01-15T16:20:00Z",
        featured: true,
        tags: ["python", "ml", "data-science"],
      },
    ];

    await Promise.all(users.map((userData) => User.create(userData)));
    await Promise.all(posts.map((postData) => Post.create(postData)));

    console.log("✅ Sample data created");

    // 5. QueryBuilder Demonstrations
    console.log("\n🔍 === QueryBuilder Comprehensive Demo ===\n");

    // === HASH KEY QUERIES ===
    console.log("🔑 1. Hash Key Query Examples:");

    // Basic hash key query
    console.log("\n📝 Basic hash key query:");
    const userQuery1 = await User.query({ id: "user1" }).exec();
    console.log(
      `Found ${userQuery1.length} user(s):`,
      userQuery1.map((u) => ({ id: u.id, name: u.name })),
    );

    // === COMPOSITE KEY QUERIES ===
    console.log("\n🔑 2. Composite Key Query Examples:");

    // Exact match with both keys
    console.log("\n📝 Exact match (hash + range key):");
    const postQuery1 = await Post.query({
      userId: "user1",
      postId: "post1",
    }).exec();
    console.log(
      `Found ${postQuery1.length} post(s):`,
      postQuery1.map((p) => ({
        userId: p.userId,
        postId: p.postId,
        title: p.title,
      })),
    );

    // Partial key query (hash key only)
    console.log("\n📝 Partial key query (hash key only):");
    const postQuery2 = await Post.query({ userId: "user1" }).exec();
    console.log(
      `Found ${postQuery2.length} post(s) for user1:`,
      postQuery2.map((p) => ({ postId: p.postId, title: p.title })),
    );

    // === STRING OPERATORS ===
    console.log("\n📄 3. String Field Operators:");

    // String beginsWith
    console.log("\n📝 String beginsWith():");
    const postQuery3 = await Post.query({ userId: "user1" })
      .where("postId")
      .beginsWith("post")
      .exec();
    console.log(
      `Posts with postId beginning with 'post':`,
      postQuery3.map((p: any) => ({ postId: p.postId, title: p.title })),
    );

    // String contains (filter)
    console.log("\n📝 String contains() filter:");
    const postQuery4 = await Post.query({ userId: "user1" })
      .filter("title")
      .contains("TypeScript")
      .exec();
    console.log(
      `Posts with 'TypeScript' in title:`,
      postQuery4.map((p) => ({ title: p.title })),
    );

    // String equals
    console.log("\n📝 String equals():");
    const postQuery5 = await Post.query({ userId: "user1" })
      .filter("category")
      .eq("technology")
      .exec();
    console.log(
      "Technology posts:",
      postQuery5.map((p) => ({ title: p.title, category: p.category })),
    );

    // === NUMERIC OPERATORS ===
    console.log("\n🔢 4. Numeric Field Operators:");

    // Greater than
    console.log("\n📝 Numeric gt() (greater than):");
    const userQuery2 = await User.query({ id: "user1" })
      .filter("age")
      .gt(25)
      .exec();
    console.log(
      "Users older than 25:",
      userQuery2.map((u) => ({ name: u.name, age: u.age })),
    );

    // Between
    console.log("\n📝 Numeric between():");
    const postQuery6 = await Post.query({ userId: "user1" })
      .filter("views")
      .between(1000, 2000)
      .exec();
    console.log(
      "Posts with views between 1000-2000:",
      postQuery6.map((p) => ({ title: p.title, views: p.views })),
    );

    // Less than or equal
    console.log("\n📝 Numeric lte() (less than or equal):");
    const userQuery3 = await User.query({ id: "user2" })
      .filter("score")
      .lte(90)
      .exec();
    console.log(
      "Users with score <= 90:",
      userQuery3.map((u) => ({ name: u.name, score: u.score })),
    );

    // === BOOLEAN OPERATORS ===
    console.log("\n🔘 5. Boolean Field Operators:");

    // Boolean equals
    console.log("\n📝 Boolean eq():");
    const userQuery4 = await User.query({ id: "user1" })
      .filter("isVip")
      .eq(true)
      .exec();
    console.log(
      "VIP users:",
      userQuery4.map((u) => ({ name: u.name, isVip: u.isVip })),
    );

    const postQuery7 = await Post.query({ userId: "user1" })
      .filter("featured")
      .eq(false)
      .exec();
    console.log(
      "Non-featured posts:",
      postQuery7.map((p) => ({ title: p.title, featured: p.featured })),
    );

    // === ARRAY OPERATORS ===
    console.log("\n🔗 6. Array Field Operators:");

    // Array contains
    console.log("\n📝 Array contains():");
    const userQuery5 = await User.query({ id: "user1" })
      .filter("tags")
      .contains("typescript")
      .exec();
    console.log(
      "Users with 'typescript' tag:",
      userQuery5.map((u) => ({ name: u.name, tags: u.tags })),
    );

    // === IN OPERATOR ===
    console.log("\n📋 7. IN Operator:");

    // String in array
    console.log("\n📝 String in():");
    const userQuery6 = await User.query({ id: "user2" })
      .filter("department")
      .in(["engineering", "marketing"])
      .exec();
    console.log(
      "Users in engineering/marketing:",
      userQuery6.map((u) => ({ name: u.name, department: u.department })),
    );

    // Numeric in array
    console.log("\n📝 Numeric in():");
    const userQuery7 = await User.query({ id: "user1" })
      .filter("age")
      .in([28, 29, 30])
      .exec();
    console.log(
      "Users aged 28, 29, or 30:",
      userQuery7.map((u) => ({ name: u.name, age: u.age })),
    );

    // === EXISTS/NOT EXISTS ===
    console.log("\n❓ 8. Exists/Not Exists:");

    // Field exists
    console.log("\n📝 Field exists():");
    const userQuery8 = await User.query({ id: "user1" })
      .filter("lastLogin")
      .exists()
      .exec();
    console.log(
      "Users with lastLogin field:",
      userQuery8.map((u) => ({ name: u.name, lastLogin: u.lastLogin })),
    );

    // === COMPLEX QUERIES ===
    console.log("\n🔀 9. Complex Multi-Condition Queries:");

    // Multiple filters
    console.log("\n📝 Multiple filter conditions (AND logic):");
    const userQuery9 = await User.query({ id: "user1" })
      .filter("status")
      .eq("active")
      .filter("age")
      .gte(25)
      .filter("isVip")
      .eq(true)
      .filter("department")
      .eq("engineering")
      .exec();
    console.log(
      "Complex user filter:",
      userQuery9.map((u) => ({
        name: u.name,
        status: u.status,
        age: u.age,
        isVip: u.isVip,
        department: u.department,
      })),
    );

    // Range key + filters
    console.log("\n📝 Range key condition + filters:");
    const postQuery8 = await Post.query({ userId: "user1" })
      .where("postId")
      .beginsWith("post")
      .filter("views")
      .gt(1000)
      .filter("featured")
      .eq(true)
      .loadAll()
      .exec();
    console.log(
      "Featured posts with >1000 views:",
      postQuery8.map((p: any) => ({
        postId: p.postId,
        title: p.title,
        views: p.views,
        featured: p.featured,
      })),
    );

    // === QUERY OPTIONS ===
    console.log("\n⚙️ 10. Query Options:");

    // Limit
    console.log("\n📝 Query with limit:");
    const limitQuery = await Post.query({ userId: "user1" }).limit(1).exec();
    console.log(
      "Limited to 1 post:",
      limitQuery.map((p) => ({ title: p.title })),
    );

    // Ascending/Descending
    console.log("\n📝 Query with descending order:");
    const sortQuery = await Post.query({ userId: "user1" }).descending().exec();
    console.log(
      "Posts in descending order:",
      sortQuery.map((p) => ({ postId: p.postId, title: p.title })),
    );

    // Consistent read
    console.log("\n📝 Query with consistent read:");
    const consistentQuery = await User.query({ id: "user1" })
      .consistentRead(true)
      .exec();
    console.log(
      "Consistent read result:",
      consistentQuery.map((u) => ({ name: u.name })),
    );

    // === PAGINATION ===
    console.log("\n📄 11. Pagination Examples:");

    // execWithPagination
    console.log("\n📝 Paginated query:");
    const paginatedResult = await Post.query({ userId: "user1" })
      .limit(1)
      .execWithPagination();
    console.log("Page 1:", {
      items: paginatedResult.items.map((p) => ({ title: p.title })),
      count: paginatedResult.count,
      hasMorePages: !!paginatedResult.lastEvaluatedKey,
    });

    if (paginatedResult.lastEvaluatedKey) {
      console.log("\n📝 Next page with startKey:");
      const nextPage = await Post.query({ userId: "user1" })
        .startKey(paginatedResult.lastEvaluatedKey)
        .limit(1)
        .execWithPagination();
      console.log("Page 2:", {
        items: nextPage.items.map((p) => ({ title: p.title })),
        count: nextPage.count,
      });
    }

    // === STREAMING ===
    console.log("\n🌊 12. Streaming Large Results:");

    // Stream example
    console.log("\n📝 Streaming results:");
    let batchCount = 0;
    let totalItems = 0;
    for await (const batch of Post.query({ userId: "user1" }).stream()) {
      batchCount++;
      totalItems += batch.length;
      console.log(
        `Batch ${batchCount}: ${batch.length} items - titles: ${batch.map((p) => p.title).join(", ")}`,
      );
    }
    console.log(
      `Streaming complete: ${batchCount} batches, ${totalItems} total items`,
    );

    // === LOAD ALL ===
    console.log("\n📚 13. Load All Results:");

    // Load all with loadAll()
    console.log("\n📝 Load all results:");
    const allPosts = await Post.query({ userId: "user1" }).loadAll().exec();
    console.log(
      `Loaded all ${allPosts.length} posts:`,
      allPosts.map((p) => ({ title: p.title })),
    );

    console.log("\n✅ QueryBuilder demo completed successfully!");
  } catch (error) {
    console.error("❌ Demo failed:", error);

    // Clean up tables on error
    try {
      console.log("\n🧹 Cleaning up tables...");
      await tableManager.deleteTable("demo-users").catch(() => { });
      await tableManager.deleteTable("demo-posts").catch(() => { });
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

export { main as runQueryDemo };
