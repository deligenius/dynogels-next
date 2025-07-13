import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import dynogels, { types, type ModelStatic, type ModelInstance } from '../../index.js';

// Define schema types
type UserSchema = z.infer<typeof userSchemaDefinition>;
type BlogPostSchema = z.infer<typeof blogPostSchemaDefinition>;
type CommentSchema = z.infer<typeof commentSchemaDefinition>;
type ProductSchema = z.infer<typeof productSchemaDefinition>;

// Schema definitions
const userSchemaDefinition = z.object({
  id: types.uuid(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().min(0).max(150).optional(),
  roles: types.stringSet().optional(),
  settings: z.object({
    theme: z.enum(['light', 'dark']).default('light'),
    notifications: z.boolean().default(true),
    language: z.string().default('en'),
  }).optional(),
  metadata: z.record(z.any()).optional(),
  tags: types.stringSet().optional(),
  score: z.number().default(0),
});

const blogPostSchemaDefinition = z.object({
  authorId: z.string(),
  postId: types.uuid(),
  title: z.string(),
  content: z.string(),
  published: z.boolean().default(false),
  tags: types.stringSet().optional(),
  views: z.number().default(0),
  likes: z.number().default(0),
  category: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const commentSchemaDefinition = z.object({
  postId: z.string(),
  commentId: types.uuid(),
  authorId: z.string(),
  content: z.string(),
  approved: z.boolean().default(false),
  parentCommentId: z.string().optional(),
  likes: z.number().default(0),
});

const productSchemaDefinition = z.object({
  productId: types.uuid(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),
  category: z.string(),
  tags: types.stringSet().optional(),
  inStock: z.boolean().default(true),
  stockCount: z.number().default(0),
  ratings: z.array(z.number().min(1).max(5)).optional(),
  averageRating: z.number().optional(),
  manufacturer: z.object({
    name: z.string().optional(),
    country: z.string().optional(),
    website: z.string().url().optional(),
  }).optional(),
  specifications: z.record(z.any()).optional(),
});

// Configure for local DynamoDB (matching the original test)
dynogels.AWS.config.update({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  region: 'localhost',
  endpoint: 'http://localhost:8000',
});

describe('Local DynamoDB Integration Tests', () => {
  let User: ModelStatic<UserSchema>;
  let BlogPost: ModelStatic<BlogPostSchema>;
  let Comment: ModelStatic<CommentSchema>;
  let Product: ModelStatic<ProductSchema>;
  let testUser: ModelInstance<UserSchema> | null = null; // Global test user for error handling tests
  let testAuthor: ModelInstance<UserSchema>;
  let testPosts: ModelInstance<BlogPostSchema>[] = []; // Global variables for comment tests

  beforeAll(() => {
    // Define User model
    User = dynogels.define('LocalTestUser', {
      hashKey: 'id',
      timestamps: true,
      schema: userSchemaDefinition,
    }) as ModelStatic<UserSchema>;

    // Define BlogPost model with hash and range key
    BlogPost = dynogels.define('LocalTestBlogPost', {
      hashKey: 'authorId',
      rangeKey: 'postId',
      timestamps: true,
      schema: blogPostSchemaDefinition,
      indexes: [
        {
          hashKey: 'category',
          rangeKey: 'createdAt',
          name: 'CategoryIndex',
          type: 'global',
        },
      ],
    }) as ModelStatic<BlogPostSchema>;

    // Define Comment model
    Comment = dynogels.define('LocalTestComment', {
      hashKey: 'postId',
      rangeKey: 'commentId',
      timestamps: true,
      schema: commentSchemaDefinition,
    }) as ModelStatic<CommentSchema>;

    // Define Product model for testing complex operations
    Product = dynogels.define('LocalTestProduct', {
      hashKey: 'productId',
      timestamps: true,
      schema: productSchemaDefinition,
    }) as ModelStatic<ProductSchema>;
  });

  describe('Table Management', () => {
    it('should create all test tables', async () => {
      const options = {
        LocalTestUser: { readCapacity: 1, writeCapacity: 1 },
        LocalTestBlogPost: { readCapacity: 1, writeCapacity: 1 },
        LocalTestComment: { readCapacity: 1, writeCapacity: 1 },
        LocalTestProduct: { readCapacity: 1, writeCapacity: 1 },
      };

      await expect(dynogels.createTables(options)).resolves.not.toThrow();
    });

    it('should describe tables successfully', async () => {
      const userTable = await User.describeTable();
      const blogTable = await BlogPost.describeTable();
      const commentTable = await Comment.describeTable();
      const productTable = await Product.describeTable();

      expect(userTable.Table).toBeDefined();
      expect(userTable.Table.TableStatus).toBe('ACTIVE');
      expect(blogTable.Table).toBeDefined();
      expect(blogTable.Table.TableStatus).toBe('ACTIVE');
      expect(commentTable.Table).toBeDefined();
      expect(commentTable.Table.TableStatus).toBe('ACTIVE');
      expect(productTable.Table).toBeDefined();
      expect(productTable.Table.TableStatus).toBe('ACTIVE');
    });
  });

  describe('User CRUD Operations', () => {
    it('should create a user with all field types', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        age: 30,
        roles: ['admin', 'editor'],
        settings: {
          theme: 'dark',
          notifications: false,
          language: 'es',
        },
        metadata: {
          source: 'api',
          version: '1.0',
          features: ['premium', 'beta'],
        },
        tags: ['developer', 'typescript'],
        score: 100,
      };

      const user = await User.create(userData);

      expect(user).toBeDefined();
      expect(user.get('email')).toBe('test@example.com');
      expect(user.get('name')).toBe('Test User');
      expect(user.get('roles')).toContain('admin');
      expect(user.get('settings').theme).toBe('dark');

      // Timestamps should exist when enabled
      expect(user.get('createdAt')).toBeDefined();
      const createdAt = user.get('createdAt');
      expect(createdAt instanceof Date || typeof createdAt === 'string').toBe(true);

      testUser = user;
    });

    it('should retrieve the created user', async () => {
      if (!testUser) {
        throw new Error('No test user created in previous test');
      }

      const user = await User.get(testUser.get('id'));
      expect(user).toBeDefined();
      expect(user!.get('email')).toBe('test@example.com');
      expect(user!.get('name')).toBe('Test User');
      expect(user!.get('roles')).toContain('admin');
    });

    it('should update user with consistent read', async () => {
      if (!testUser) {
        throw new Error('No test user created in previous test');
      }

      const user = await User.get(testUser.get('id'), { ConsistentRead: true });
      expect(user).toBeDefined();

      user!.set('name', 'Updated Test User');
      user!.set('age', 31);
      // Use update operation instead of $add on the item
      const currentScore = user!.get('score') || 0;
      user!.set('score', currentScore + 50);

      const updatedUser = await user!.save();
      expect(updatedUser.get('name')).toBe('Updated Test User');
      expect(updatedUser.get('age')).toBe(31);
      expect(updatedUser.get('score')).toBe(150);
    });

    it('should handle validation errors', async () => {
      await expect(
        User.create({
          email: 'invalid-email',
          name: 'Test User',
        })
      ).rejects.toThrow();
    });

    it('should create multiple users in batch', async () => {
      const users = [];
      for (let i = 0; i < 5; i++) {
        users.push({
          email: `batch-user-${i}@example.com`,
          name: `Batch User ${i}`,
          age: 20 + i,
          score: i * 10,
        });
      }

      const createdUsers = await User.create(users);
      expect(createdUsers).toHaveLength(5);
      createdUsers.forEach((user: any, index: number) => {
        expect(user.get('email')).toBe(`batch-user-${index}@example.com`);
        expect(user.get('name')).toBe(`Batch User ${index}`);
      });
    });
  });

  describe('BlogPost Operations with Hash and Range Key', () => {
    beforeAll(async () => {
      testAuthor = await User.create({
        email: 'author@example.com',
        name: 'Blog Author',
        age: 35,
      });
    });

    it('should create blog posts with range keys', async () => {
      const posts = [
        {
          authorId: testAuthor.get('id'),
          title: 'First Blog Post',
          content: 'This is the content of the first blog post.',
          published: true,
          category: 'technology',
          tags: ['javascript', 'nodejs'],
        },
        {
          authorId: testAuthor.get('id'),
          title: 'Second Blog Post',
          content: 'This is the content of the second blog post.',
          published: false,
          category: 'programming',
          tags: ['typescript', 'aws'],
        },
        {
          authorId: testAuthor.get('id'),
          title: 'Third Blog Post',
          content: 'This is the content of the third blog post.',
          published: true,
          category: 'technology',
          tags: ['dynamodb', 'nosql'],
        },
      ];

      const createdPosts = await Promise.all(
        posts.map(post => BlogPost.create(post))
      );

      expect(createdPosts).toHaveLength(3);

      createdPosts.forEach((post: any, index: number) => {
        expect(post.get('authorId')).toBe(testAuthor.get('id'));
        expect(post.get('title')).toBe(posts[index].title);
        expect(post.get('postId')).toBeDefined();
      });

      testPosts = createdPosts;
    });

    it('should query posts by author', async () => {
      const posts = await BlogPost.query(testAuthor.get('id')).exec();
      expect(posts.Items).toHaveLength(3);
      posts.Items.forEach((post: any) => {
        expect(post.get('authorId')).toBe(testAuthor.get('id'));
      });
    });

    it('should query posts with filters', async () => {
      const posts = await BlogPost.query(testAuthor.get('id'))
        .filter('published')
        .equals(true)
        .exec();

      expect(posts.Items).toHaveLength(2);
      posts.Items.forEach((post: any) => {
        expect(post.get('published')).toBe(true);
      });
    });

    it('should query with limit and ordering', async () => {
      const posts = await BlogPost.query(testAuthor.get('id'))
        .limit(2)
        .descending()
        .exec();

      expect(posts.Items).toHaveLength(2);
    });

    it('should get specific post by hash and range key', async () => {
      const firstPost = testPosts[0];

      const post = await BlogPost.get(
        testAuthor.get('id'),
        firstPost.get('postId')
      );

      expect(post).toBeDefined();
      expect(post!.get('title')).toBe('First Blog Post');
      expect(post!.get('authorId')).toBe(testAuthor.get('id'));
    });

    it('should update post content', async () => {
      const firstPost = testPosts[0];

      const updatedPost = await BlogPost.update(
        {
          authorId: testAuthor.get('id'),
          postId: firstPost.get('postId'),
        },
        {
          title: 'Updated First Blog Post',
          content: 'This is the updated content.',
          views: { $add: 10 },
        }
      );

      expect(updatedPost.get('title')).toBe('Updated First Blog Post');
      expect(updatedPost.get('views')).toBe(10);
    });
  });

  describe('Comment Operations', () => {
    let testPost: any;

    beforeAll(() => {
      if (testPosts.length === 0) {
        throw new Error('No test posts available for comment tests');
      }
      testPost = testPosts[0];
    });

    it('should create comments on blog post', async () => {
      const comments = [
        {
          postId: testPost.get('postId'),
          authorId: testAuthor.get('id'),
          content: 'Great post! Very informative.',
          approved: true,
        },
        {
          postId: testPost.get('postId'),
          authorId: 'commenter-2',
          content: 'I disagree with some points.',
          approved: false,
        },
        {
          postId: testPost.get('postId'),
          authorId: 'commenter-3',
          content: 'Thanks for sharing this!',
          approved: true,
        },
      ];

      const createdComments = await Promise.all(
        comments.map(comment => Comment.create(comment))
      );

      expect(createdComments).toHaveLength(3);

      createdComments.forEach((comment: any, index: number) => {
        expect(comment.get('postId')).toBe(testPost.get('postId'));
        expect(comment.get('content')).toBe(comments[index].content);
      });
    });

    it('should query comments by post', async () => {
      const comments = await Comment.query(testPost.get('postId')).exec();
      expect(comments.Items).toHaveLength(3);
      comments.Items.forEach((comment: any) => {
        expect(comment.get('postId')).toBe(testPost.get('postId'));
      });
    });

    it('should filter approved comments', async () => {
      const comments = await Comment.query(testPost.get('postId'))
        .filter('approved')
        .equals(true)
        .exec();

      expect(comments.Items).toHaveLength(2);
      comments.Items.forEach((comment: any) => {
        expect(comment.get('approved')).toBe(true);
      });
    });
  });

  describe('Product Operations with Complex Data', () => {
    let testProducts: any[] = [];

    it('should create products with complex nested data', async () => {
      const products = [
        {
          name: 'MacBook Pro',
          description: 'Professional laptop for developers',
          price: 2499.99,
          category: 'electronics',
          tags: ['laptop', 'apple', 'professional'],
          inStock: true,
          stockCount: 50,
          ratings: [5, 4, 5, 5, 4],
          averageRating: 4.6,
          manufacturer: {
            name: 'Apple Inc.',
            country: 'USA',
            website: 'https://apple.com',
          },
          specifications: {
            cpu: 'M1 Pro',
            ram: '16GB',
            storage: '512GB SSD',
            screen: '14-inch Retina',
            weight: '1.6kg',
          },
        },
        {
          name: 'iPhone 14',
          description: 'Latest smartphone from Apple',
          price: 999.99,
          category: 'electronics',
          tags: ['smartphone', 'apple', 'mobile'],
          inStock: true,
          stockCount: 100,
          ratings: [5, 5, 4, 5],
          averageRating: 4.75,
          manufacturer: {
            name: 'Apple Inc.',
            country: 'USA',
            website: 'https://apple.com',
          },
          specifications: {
            cpu: 'A16 Bionic',
            storage: '128GB',
            screen: '6.1-inch Super Retina XDR',
            camera: '48MP Main',
          },
        },
      ];

      const createdProducts = await Promise.all(
        products.map(product => Product.create(product))
      );

      expect(createdProducts).toHaveLength(2);

      createdProducts.forEach((product: any, index: number) => {
        expect(product.get('name')).toBe(products[index].name);
        expect(product.get('price')).toBe(products[index].price);
        expect(product.get('manufacturer').name).toBe('Apple Inc.');
        expect(product.get('specifications')).toBeTypeOf('object');
      });

      testProducts = createdProducts;
    });

    it('should scan products by category', async () => {
      const products = await Product.scan()
        .where('category')
        .equals('electronics')
        .exec();

      expect(products.Items).toHaveLength(2);
      products.Items.forEach((product: any) => {
        expect(product.get('category')).toBe('electronics');
      });
    });

    it('should scan products with price filter', async () => {
      const products = await Product.scan()
        .where('price')
        .gt(1000)
        .exec();

      expect(products.Items).toHaveLength(1);
      expect(products.Items[0].get('name')).toBe('MacBook Pro');
    });

    it('should update product stock', async () => {
      const macbook = testProducts[0];

      const updatedProduct = await Product.update(
        {
          productId: macbook.get('productId'),
        },
        {
          stockCount: { $add: -5 }, // Sold 5 units
          inStock: false,
        }
      );

      expect(updatedProduct.get('stockCount')).toBe(45);
      expect(updatedProduct.get('inStock')).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    let batchUsers: any[] = [];

    beforeAll(async () => {
      // Create some users for batch operations
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push({
          email: `batch-${i}@example.com`,
          name: `Batch User ${i}`,
          age: 20 + i,
        });
      }

      batchUsers = await Promise.all(
        users.map(user => User.create(user))
      );
    });

    it('should batch get multiple users', async () => {
      const userIds = batchUsers.slice(0, 5).map((user: any) => user.get('id'));

      const users = await User.getItems(userIds);
      expect(users).toHaveLength(5);
      users.forEach((user: any) => {
        expect(userIds).toContain(user.get('id'));
      });
    });

    it('should batch get with consistent read', async () => {
      const userIds = batchUsers.slice(5, 8).map((user: any) => user.get('id'));

      const users = await User.getItems(userIds, { ConsistentRead: true });
      expect(users).toHaveLength(3);
    });

    it('should handle batch get with non-existent items', async () => {
      const mixedIds = [
        batchUsers[0].get('id'),
        'non-existent-id-1',
        batchUsers[1].get('id'),
        'non-existent-id-2',
      ];

      const users = await User.getItems(mixedIds);
      expect(users).toHaveLength(2); // Only existing users returned
    });
  });

  describe('Advanced Query and Scan Operations', () => {
    it('should perform parallel scan', async () => {
      const result = await User.parallelScan(4).exec();
      expect(result.Items).toBeInstanceOf(Array);
      expect(result.Items.length).toBeGreaterThanOrEqual(1);
    });

    it('should scan with expression filters', async () => {
      const result = await User.scan()
        .filterExpression('#age > :age')
        .expressionAttributeNames({ '#age': 'age' })
        .expressionAttributeValues({ ':age': 25 })
        .exec();

      expect(result.Items).toBeInstanceOf(Array);
      result.Items.forEach((user: any) => {
        expect(user.get('age')).toBeGreaterThan(25);
      });
    });

    it('should count items in scan', async () => {
      const result = await User.scan()
        .select('COUNT')
        .exec();

      expect(result.Count).toBeTypeOf('number');
      expect(result.Count).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle get non-existent item', async () => {
      const user = await User.get('non-existent-id');
      expect(user).toBeNull();
    });

    it('should handle conditional update failure', async () => {
      if (!testUser) {
        throw new Error('No test user available for conditional update test');
      }

      const userId = testUser.get('id');

      await expect(
        User.update(
          {
            id: userId,
          },
          {
            name: 'Should Not Update',
          },
          {
            expected: { age: 999 }, // This condition should fail
          }
        )
      ).rejects.toThrow();
    });

    it('should handle validation errors on update', async () => {
      if (!testUser) {
        throw new Error('No test user available for validation test');
      }

      await expect(
        User.update(
          {
            id: testUser.get('id'),
          },
          {
            email: 'invalid-email-format',
          }
        )
      ).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should delete all test tables', async () => {
      // Don't fail if tables don't exist
      try {
        await dynogels.deleteTables();
      } catch (error) {
        // Ignore errors for non-existent tables
      }
    });
  });
});