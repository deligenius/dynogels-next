import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Schema } from '../../core/Schema.js';
import { DynogelsTypes } from '../../utils/types.js';

describe('Schema', () => {
  describe('Basic Schema Operations', () => {
    it('should create a schema with hash key', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
        tableName: 'Users',
      });

      expect(schema.getHashKey()).toBe('id');
      expect(schema.getRangeKey()).toBeUndefined();
      expect(schema.getTableName()).toBe('Users');
    });

    it('should create a schema with hash and range key', () => {
      const postSchema = z.object({
        userId: z.string(),
        postId: z.string(),
        title: z.string(),
        content: z.string(),
      });

      const schema = new Schema({
        hashKey: 'userId',
        rangeKey: 'postId',
        schema: postSchema,
        tableName: 'Posts',
      });

      expect(schema.getHashKey()).toBe('userId');
      expect(schema.getRangeKey()).toBe('postId');
    });

    it('should validate data correctly', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
        age: z.number().optional(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
      });

      const validData = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      const result = schema.validate(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('123');
        expect(result.data.name).toBe('John Doe');
      }
    });

    it('should reject invalid data', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
      });

      const invalidData = {
        id: '123',
        name: 'John Doe',
        email: 'invalid-email', // Invalid email
      };

      const result = schema.validate(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Timestamps', () => {
    it('should add timestamps when enabled', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
        timestamps: true,
      });

      expect(schema.hasTimestamps()).toBe(true);
      expect(schema.getCreatedAtField()).toBe('createdAt');
      expect(schema.getUpdatedAtField()).toBe('updatedAt');

      const data = { id: '123', name: 'John' };
      const withTimestamps = schema.addTimestampsForCreate(data);

      expect(withTimestamps.createdAt).toBeInstanceOf(Date);
      expect(withTimestamps.updatedAt).toBeInstanceOf(Date);
    });

    it('should use custom timestamp field names', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
        timestamps: true,
        createdAt: 'created',
        updatedAt: 'modified',
      });

      expect(schema.getCreatedAtField()).toBe('created');
      expect(schema.getUpdatedAtField()).toBe('modified');
    });

    it('should not add timestamps when disabled', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
        timestamps: false,
      });

      expect(schema.hasTimestamps()).toBe(false);
      expect(schema.getCreatedAtField()).toBeNull();
      expect(schema.getUpdatedAtField()).toBeNull();
    });
  });

  describe('Key Extraction', () => {
    it('should extract hash key from item', () => {
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
      });

      const item = { id: '123', name: 'John' };
      const key = schema.extractKey(item);

      expect(key).toEqual({ id: '123' });
    });

    it('should extract hash and range key from item', () => {
      const postSchema = z.object({
        userId: z.string(),
        postId: z.string(),
        title: z.string(),
      });

      const schema = new Schema({
        hashKey: 'userId',
        rangeKey: 'postId',
        schema: postSchema,
      });

      const item = { userId: 'user123', postId: 'post456', title: 'Hello' };
      const key = schema.extractKey(item);

      expect(key).toEqual({ userId: 'user123', postId: 'post456' });
    });
  });

  describe('Dynogels Types', () => {
    it('should work with UUID type', () => {
      const userSchema = z.object({
        id: DynogelsTypes.uuid(),
        name: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
      });

      // Create with default UUID
      const data = { name: 'John' };
      const result = schema.applyDefaults(data);

      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(result.name).toBe('John');
    });

    it('should work with string sets', () => {
      const userSchema = z.object({
        id: z.string(),
        tags: DynogelsTypes.stringSet(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
      });

      const data = { id: '123', tags: ['tag1', 'tag2', 'tag3'] };
      const result = schema.validate(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toBeInstanceOf(Set);
        expect(Array.from(result.data.tags as Set<string>)).toEqual(['tag1', 'tag2', 'tag3']);
      }
    });

    it('should work with number sets', () => {
      const productSchema = z.object({
        id: z.string(),
        ratings: DynogelsTypes.numberSet(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: productSchema,
      });

      const data = { id: '123', ratings: [1, 2, 3, 4, 5] };
      const result = schema.validate(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ratings).toBeInstanceOf(Set);
        expect(Array.from(result.data.ratings as Set<number>)).toEqual([1, 2, 3, 4, 5]);
      }
    });
  });

  describe('Indexes', () => {
    it('should store index configuration', () => {
      const userSchema = z.object({
        id: z.string(),
        email: z.string(),
        status: z.string(),
      });

      const schema = new Schema({
        hashKey: 'id',
        schema: userSchema,
        indexes: [
          {
            name: 'EmailIndex',
            type: 'global',
            hashKey: 'email',
          },
          {
            name: 'StatusIndex',
            type: 'global',
            hashKey: 'status',
            rangeKey: 'id',
          },
        ],
      });

      const indexes = schema.getIndexes();
      expect(indexes).toHaveLength(2);

      const emailIndex = schema.getIndex('EmailIndex');
      expect(emailIndex).toBeDefined();
      expect(emailIndex!.hashKey).toBe('email');
      expect(emailIndex!.type).toBe('global');

      const statusIndex = schema.getIndex('StatusIndex');
      expect(statusIndex).toBeDefined();
      expect(statusIndex!.hashKey).toBe('status');
      expect(statusIndex!.rangeKey).toBe('id');
    });
  });
});