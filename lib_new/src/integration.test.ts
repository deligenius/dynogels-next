import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { Dynogels } from './Table.js';
import { 
  initializeTestDynogels, 
  createTestModel, 
  generateTableName, 
  waitForTable, 
  cleanupTable,
  TestSchemas,
  generateTestData
} from './test-utils.js';

/**
 * Integration tests that require a running DynamoDB Local instance
 * Start DynamoDB Local with: java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
 * Or using Docker: docker run -p 8000:8000 amazon/dynamodb-local
 */

describe('Integration Tests - DynamoDB Local', () => {
  beforeAll(() => {
    initializeTestDynogels();
  });

  describe('End-to-End User Workflow', () => {
    let UserModel: any;
    const userTableName = generateTableName('users');

    beforeEach(async () => {
      const UserSchema = z.object({
        userId: z.string(),
        email: z.string().email(),
        name: z.string(),
        age: z.number().min(0).max(150).optional(),
        preferences: z.object({
          theme: z.enum(['light', 'dark']).default('light'),
          notifications: z.boolean().default(true),
        }).optional(),
        tags: z.set(z.string()).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      });

      UserModel = createTestModel(userTableName, UserSchema, {
        hashKey: 'userId',
        timestamps: true,
        validation: {
          allowUnknown: false,
        },
      });

      await UserModel.createTable();
      await waitForTable(UserModel);
    });

    afterEach(async () => {
      await cleanupTable(UserModel);
    });

    it('should handle complete user lifecycle', async () => {
      const userId = 'user123';
      
      // 1. Create a new user
      const userData = {
        userId,
        email: 'test@example.com',
        name: 'Test User',
        age: 25,
        preferences: {
          theme: 'dark' as const,
          notifications: false,
        },
        tags: new Set(['developer', 'typescript']),
        metadata: {
          source: 'api',
          version: '1.0',
        },
      };

      const createdUser = await UserModel.create(userData);
      
      expect(createdUser).toBeDefined();
      expect(createdUser.userId).toBe(userId);
      expect(createdUser.email).toBe('test@example.com');
      expect(createdUser.preferences.theme).toBe('dark');
      expect(createdUser.tags).toEqual(new Set(['developer', 'typescript']));
      expect(createdUser.createdAt).toBeDefined();
      expect(createdUser.updatedAt).toBeDefined();

      // 2. Retrieve the user
      const retrievedUser = await UserModel.get({ userId });
      
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser.userId).toBe(userId);
      expect(retrievedUser.email).toBe('test@example.com');
      expect(retrievedUser.name).toBe('Test User');
      expect(retrievedUser.age).toBe(25);

      // 3. Update user information
      const updatedUser = await UserModel.update(
        { userId },
        { 
          name: 'Updated Test User',
          age: 26,
          preferences: {
            theme: 'light' as const,
            notifications: true,
          },
        }
      );

      expect(updatedUser.name).toBe('Updated Test User');
      expect(updatedUser.age).toBe(26);
      expect(updatedUser.preferences.theme).toBe('light');
      expect(new Date(updatedUser.updatedAt).getTime()).toBeGreaterThan(
        new Date(updatedUser.createdAt).getTime()
      );

      // 4. Verify update persisted
      const verifyUser = await UserModel.get({ userId });
      expect(verifyUser.name).toBe('Updated Test User');
      expect(verifyUser.age).toBe(26);

      // 5. Delete the user
      await UserModel.destroy({ userId });

      // 6. Verify deletion
      const deletedUser = await UserModel.get({ userId });
      expect(deletedUser).toBeNull();
    });

    it('should handle validation errors gracefully', async () => {
      // Test invalid email
      await expect(
        UserModel.create({
          userId: 'invalid-user',
          email: 'not-an-email',
          name: 'Invalid User',
        })
      ).rejects.toThrow();

      // Test invalid age
      await expect(
        UserModel.create({
          userId: 'invalid-user2',
          email: 'valid@example.com',
          name: 'Invalid User',
          age: -5, // Invalid age
        })
      ).rejects.toThrow();

      // Test missing required fields
      await expect(
        UserModel.create({
          userId: 'incomplete-user',
          // Missing email and name
        })
      ).rejects.toThrow();
    });
  });

  describe('Multi-Table Operations', () => {
    let PostModel: any;
    let CommentModel: any;
    const postTableName = generateTableName('posts');
    const commentTableName = generateTableName('comments');

    beforeEach(async () => {
      const PostSchema = z.object({
        postId: z.string(),
        title: z.string(),
        content: z.string(),
        authorId: z.string(),
        published: z.boolean().default(false),
      });

      const CommentSchema = z.object({
        postId: z.string(),
        commentId: z.string(),
        content: z.string(),
        authorId: z.string(),
      });

      PostModel = createTestModel(postTableName, PostSchema, {
        hashKey: 'postId',
        timestamps: true,
      });

      CommentModel = createTestModel(commentTableName, CommentSchema, {
        hashKey: 'postId',
        rangeKey: 'commentId',
        timestamps: true,
      });

      // Create both tables
      await PostModel.createTable();
      await CommentModel.createTable();
      
      // Wait for both tables to be active
      await Promise.all([
        waitForTable(PostModel),
        waitForTable(CommentModel),
      ]);
    });

    afterEach(async () => {
      await Promise.all([
        cleanupTable(PostModel),
        cleanupTable(CommentModel),
      ]);
    });

    it('should handle operations across multiple tables', async () => {
      const postId = 'post123';
      const authorId = 'author456';

      // 1. Create a blog post
      const post = await PostModel.create({
        postId,
        title: 'Test Blog Post',
        content: 'This is the content of the test blog post.',
        authorId,
        published: true,
      });

      expect(post.postId).toBe(postId);
      expect(post.title).toBe('Test Blog Post');
      expect(post.published).toBe(true);

      // 2. Create multiple comments on the post
      const comments = [];
      for (let i = 1; i <= 3; i++) {
        const comment = await CommentModel.create({
          postId,
          commentId: `comment${i}`,
          content: `This is comment number ${i}`,
          authorId: `commenter${i}`,
        });
        comments.push(comment);
      }

      expect(comments).toHaveLength(3);
      expect(comments[0].postId).toBe(postId);
      expect(comments[0].commentId).toBe('comment1');

      // 3. Retrieve the post
      const retrievedPost = await PostModel.get({ postId });
      expect(retrievedPost).toBeDefined();
      expect(retrievedPost.title).toBe('Test Blog Post');

      // 4. Retrieve specific comments
      const retrievedComment = await CommentModel.get({
        postId,
        commentId: 'comment1',
      });
      expect(retrievedComment).toBeDefined();
      expect(retrievedComment.content).toBe('This is comment number 1');

      // 5. Update the post
      const updatedPost = await PostModel.update(
        { postId },
        { title: 'Updated Blog Post Title' }
      );
      expect(updatedPost.title).toBe('Updated Blog Post Title');

      // 6. Delete a comment
      await CommentModel.destroy({
        postId,
        commentId: 'comment2',
      });

      // Verify comment is deleted
      const deletedComment = await CommentModel.get({
        postId,
        commentId: 'comment2',
      });
      expect(deletedComment).toBeNull();

      // 7. Verify other comments still exist
      const remainingComment = await CommentModel.get({
        postId,
        commentId: 'comment1',
      });
      expect(remainingComment).toBeDefined();
    });
  });

  describe('Performance and Concurrency', () => {
    let PerfModel: any;
    const perfTableName = generateTableName('performance');

    beforeEach(async () => {
      const PerfSchema = z.object({
        id: z.string(),
        data: z.string(),
        counter: z.number().default(0),
      });

      PerfModel = createTestModel(perfTableName, PerfSchema, {
        hashKey: 'id',
        timestamps: true,
      });

      await PerfModel.createTable();
      await waitForTable(PerfModel);
    });

    afterEach(async () => {
      await cleanupTable(PerfModel);
    });

    it('should handle concurrent operations', async () => {
      const itemId = 'concurrent-test';
      
      // Create initial item
      await PerfModel.create({
        id: itemId,
        data: 'initial data',
        counter: 0,
      });

      // Perform concurrent updates
      const concurrentUpdates = Array.from({ length: 5 }, (_, i) => 
        PerfModel.update(
          { id: itemId },
          { 
            data: `updated data ${i}`,
            counter: i + 1,
          }
        )
      );

      const results = await Promise.allSettled(concurrentUpdates);
      
      // At least one update should succeed
      const successfulUpdates = results.filter(result => result.status === 'fulfilled');
      expect(successfulUpdates.length).toBeGreaterThan(0);

      // Verify final state
      const finalItem = await PerfModel.get({ id: itemId });
      expect(finalItem).toBeDefined();
      expect(finalItem.id).toBe(itemId);
    });

    it('should handle batch operations efficiently', async () => {
      const batchSize = 10;
      const items = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-item-${i}`,
        data: `batch data ${i}`,
        counter: i,
      }));

      // Create items in sequence (current implementation doesn't have batch create)
      const startTime = Date.now();
      
      for (const item of items) {
        await PerfModel.create(item);
      }
      
      const createTime = Date.now() - startTime;
      console.log(`Created ${batchSize} items in ${createTime}ms`);

      // Retrieve all items
      const retrieveStartTime = Date.now();
      
      const retrievedItems = [];
      for (let i = 0; i < batchSize; i++) {
        const item = await PerfModel.get({ id: `batch-item-${i}` });
        retrievedItems.push(item);
      }
      
      const retrieveTime = Date.now() - retrieveStartTime;
      console.log(`Retrieved ${batchSize} items in ${retrieveTime}ms`);

      expect(retrievedItems).toHaveLength(batchSize);
      expect(retrievedItems.every(item => item !== null)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let ErrorModel: any;
    const errorTableName = generateTableName('errors');

    beforeEach(async () => {
      const ErrorSchema = z.object({
        id: z.string(),
        data: z.string().optional(),
      });

      ErrorModel = createTestModel(errorTableName, ErrorSchema, {
        hashKey: 'id',
      });

      await ErrorModel.createTable();
      await waitForTable(ErrorModel);
    });

    afterEach(async () => {
      await cleanupTable(ErrorModel);
    });

    it('should handle non-existent items gracefully', async () => {
      const result = await ErrorModel.get({ id: 'does-not-exist' });
      expect(result).toBeNull();
    });

    it('should handle updates to non-existent items', async () => {
      await expect(
        ErrorModel.update({ id: 'does-not-exist' }, { data: 'some data' })
      ).rejects.toThrow('Item not found');
    });

    it('should handle empty string values', async () => {
      const item = await ErrorModel.create({
        id: 'empty-string-test',
        data: '',
      });

      expect(item.data).toBe('');

      const retrieved = await ErrorModel.get({ id: 'empty-string-test' });
      expect(retrieved.data).toBe('');
    });

    it('should handle long string values', async () => {
      const longString = 'a'.repeat(10000); // 10KB string
      
      const item = await ErrorModel.create({
        id: 'long-string-test',
        data: longString,
      });

      expect(item.data).toBe(longString);

      const retrieved = await ErrorModel.get({ id: 'long-string-test' });
      expect(retrieved.data).toBe(longString);
    });

    it('should handle special characters in data', async () => {
      const specialData = 'Special chars: äöü 中文 🚀 \n\t\r "quotes" \'apostrophes\' \\backslash';
      
      const item = await ErrorModel.create({
        id: 'special-chars-test',
        data: specialData,
      });

      expect(item.data).toBe(specialData);

      const retrieved = await ErrorModel.get({ id: 'special-chars-test' });
      expect(retrieved.data).toBe(specialData);
    });
  });
});