import { ModelInstance, Callback, UpdateOptions } from '../types/dynogels.js';
import { Table } from './Table.js';

export class Item<T extends Record<string, any>> implements ModelInstance<T> {
  private data: T;
  private table: Table<any>;
  private originalData: T;
  
  constructor(data: T, table: Table<any>) {
    this.data = { ...data };
    this.originalData = { ...data };
    this.table = table;
  }
  
  /**
   * Get a field value from the item
   */
  get<K extends keyof T>(field: K): T[K] {
    return this.data[field];
  }
  
  /**
   * Set a field value on the item
   */
  set<K extends keyof T>(field: K, value: T[K]): this {
    this.data[field] = value;
    return this;
  }
  
  /**
   * Save the item (create or update)
   */
  async save(callback?: Callback<ModelInstance<T>>): Promise<ModelInstance<T>> {
    try {
      // Determine if this is a new item or an update
      const isNew = this.isNewItem();
      
      let result: Item<T>;
      
      if (isNew) {
        result = await this.table.create(this.data);
      } else {
        // Find what changed and update only those fields
        const changes = this.getChanges();
        if (Object.keys(changes).length > 0) {
          const key = this.table.getSchema().extractKey(this.originalData);
          result = await this.table.update(key, changes);
        } else {
          result = this; // No changes to save
        }
      }
      
      // Update our internal state
      this.data = { ...result.data };
      this.originalData = { ...result.data };
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Delete this item
   */
  async destroy(callback?: Callback<void>): Promise<void> {
    try {
      const key = this.table.getSchema().extractKey(this.data);
      await this.table.destroy(key);
      
      if (callback) {
        callback();
      }
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Update this item with new values
   */
  async update(
    updates: Partial<T>, 
    options?: UpdateOptions, 
    callback?: Callback<ModelInstance<T>>
  ): Promise<ModelInstance<T>> {
    try {
      const key = this.table.getSchema().extractKey(this.data);
      const result = await this.table.update(key, updates, options);
      
      // Update our internal state
      this.data = { ...result.data };
      this.originalData = { ...result.data };
      
      if (callback) {
        callback(null, result);
      }
      
      return result;
    } catch (error) {
      if (callback) {
        callback(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Convert item to plain JavaScript object
   */
  toJSON(): T {
    return { ...this.data };
  }
  
  /**
   * Check if this is a new item (not yet persisted)
   */
  private isNewItem(): boolean {
    // An item is considered new if it doesn't have the required key fields from the original data
    const schema = this.table.getSchema();
    const hashKey = schema.getHashKey() as string;
    
    // If the original data doesn't have the hash key, it's a new item
    if (!this.originalData[hashKey]) {
      return true;
    }
    
    const rangeKey = schema.getRangeKey() as string;
    if (rangeKey && !this.originalData[rangeKey]) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get the changes made to this item since it was loaded
   */
  private getChanges(): Partial<T> {
    const changes: Partial<T> = {};
    
    for (const key in this.data) {
      if (this.data[key] !== this.originalData[key]) {
        changes[key] = this.data[key];
      }
    }
    
    return changes;
  }
  
  /**
   * Reset the item to its original state
   */
  reset(): this {
    this.data = { ...this.originalData };
    return this;
  }
  
  /**
   * Check if the item has unsaved changes
   */
  isDirty(): boolean {
    return Object.keys(this.getChanges()).length > 0;
  }
  
  /**
   * Get the original data when the item was loaded
   */
  getOriginalData(): T {
    return { ...this.originalData };
  }
  
  /**
   * Refresh the item from the database
   */
  async reload(): Promise<this> {
    const key = this.table.getSchema().extractKey(this.data);
    const freshItem = await this.table.get(key);
    
    if (freshItem) {
      this.data = { ...freshItem.data };
      this.originalData = { ...freshItem.data };
    }
    
    return this;
  }
}