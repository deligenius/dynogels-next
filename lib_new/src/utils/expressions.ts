export class ExpressionBuilder {
  private updateExpressions: string[] = [];
  private conditionExpressions: string[] = [];
  private attributeNames: Record<string, string> = {};
  private attributeValues: Record<string, any> = {};
  private nameCounter = 0;
  private valueCounter = 0;
  
  /**
   * Add a SET expression for updates
   */
  set(field: string, value: any): this {
    const nameKey = this.getAttributeName(field);
    const valueKey = this.getAttributeValue(value);
    
    this.updateExpressions.push(`${nameKey} = ${valueKey}`);
    return this;
  }
  
  /**
   * Add an ADD expression (for numbers and sets)
   */
  add(field: string, value: any): this {
    const nameKey = this.getAttributeName(field);
    const valueKey = this.getAttributeValue(value);
    
    // ADD expressions are separate from SET
    const addExpression = `${nameKey} ${valueKey}`;
    
    // Find existing ADD expression or create new one
    const existingAddIndex = this.updateExpressions.findIndex(expr => expr.startsWith('ADD '));
    if (existingAddIndex >= 0) {
      this.updateExpressions[existingAddIndex] += `, ${addExpression}`;
    } else {
      this.updateExpressions.push(`ADD ${addExpression}`);
    }
    
    return this;
  }
  
  /**
   * Add a REMOVE expression
   */
  remove(field: string): this {
    const nameKey = this.getAttributeName(field);
    
    // Find existing REMOVE expression or create new one
    const existingRemoveIndex = this.updateExpressions.findIndex(expr => expr.startsWith('REMOVE '));
    if (existingRemoveIndex >= 0) {
      this.updateExpressions[existingRemoveIndex] += `, ${nameKey}`;
    } else {
      this.updateExpressions.push(`REMOVE ${nameKey}`);
    }
    
    return this;
  }
  
  /**
   * Add a DELETE expression (for sets)
   */
  delete(field: string, value: any): this {
    const nameKey = this.getAttributeName(field);
    const valueKey = this.getAttributeValue(value);
    
    // Find existing DELETE expression or create new one
    const deleteExpression = `${nameKey} ${valueKey}`;
    const existingDeleteIndex = this.updateExpressions.findIndex(expr => expr.startsWith('DELETE '));
    if (existingDeleteIndex >= 0) {
      this.updateExpressions[existingDeleteIndex] += `, ${deleteExpression}`;
    } else {
      this.updateExpressions.push(`DELETE ${deleteExpression}`);
    }
    
    return this;
  }
  
  /**
   * Add a condition expression
   */
  condition(field: string, operator: string, value?: any): this {
    const nameKey = this.getAttributeName(field);
    
    let expression: string;
    if (value !== undefined) {
      const valueKey = this.getAttributeValue(value);
      expression = `${nameKey} ${operator} ${valueKey}`;
    } else {
      expression = `${nameKey} ${operator}`;
    }
    
    this.conditionExpressions.push(expression);
    return this;
  }
  
  /**
   * Add a custom condition expression with values
   */
  conditionExpression(expression: string, values?: Record<string, any>): this {
    this.conditionExpressions.push(expression);
    
    if (values) {
      Object.assign(this.attributeValues, values);
    }
    
    return this;
  }
  
  /**
   * Build the final expression object
   */
  build() {
    const result: any = {};
    
    if (this.updateExpressions.length > 0) {
      // Group expressions by type
      const setExpressions = this.updateExpressions.filter(expr => !expr.startsWith('ADD ') && !expr.startsWith('REMOVE ') && !expr.startsWith('DELETE '));
      const addExpressions = this.updateExpressions.filter(expr => expr.startsWith('ADD '));
      const removeExpressions = this.updateExpressions.filter(expr => expr.startsWith('REMOVE '));
      const deleteExpressions = this.updateExpressions.filter(expr => expr.startsWith('DELETE '));
      
      const expressionParts: string[] = [];
      
      if (setExpressions.length > 0) {
        expressionParts.push(`SET ${setExpressions.join(', ')}`);
      }
      
      if (addExpressions.length > 0) {
        expressionParts.push(...addExpressions);
      }
      
      if (removeExpressions.length > 0) {
        expressionParts.push(...removeExpressions);
      }
      
      if (deleteExpressions.length > 0) {
        expressionParts.push(...deleteExpressions);
      }
      
      result.UpdateExpression = expressionParts.join(' ');
    }
    
    if (this.conditionExpressions.length > 0) {
      result.ConditionExpression = this.conditionExpressions.join(' AND ');
    }
    
    if (Object.keys(this.attributeNames).length > 0) {
      result.ExpressionAttributeNames = this.attributeNames;
    }
    
    if (Object.keys(this.attributeValues).length > 0) {
      result.ExpressionAttributeValues = this.attributeValues;
    }
    
    return result;
  }
  
  /**
   * Get or create an attribute name placeholder
   */
  private getAttributeName(field: string): string {
    // Check if we already have a placeholder for this field
    for (const [placeholder, fieldName] of Object.entries(this.attributeNames)) {
      if (fieldName === field) {
        return placeholder;
      }
    }
    
    // Create new placeholder
    const placeholder = `#n${this.nameCounter++}`;
    this.attributeNames[placeholder] = field;
    return placeholder;
  }
  
  /**
   * Get or create an attribute value placeholder
   */
  private getAttributeValue(value: any): string {
    // Create new placeholder for each value to avoid conflicts
    const placeholder = `:v${this.valueCounter++}`;
    this.attributeValues[placeholder] = value;
    return placeholder;
  }
  
  /**
   * Reset the builder for reuse
   */
  reset(): this {
    this.updateExpressions = [];
    this.conditionExpressions = [];
    this.attributeNames = {};
    this.attributeValues = {};
    this.nameCounter = 0;
    this.valueCounter = 0;
    return this;
  }
}

/**
 * Helper function to build update expressions from an object
 */
export function buildUpdateExpression(updates: Record<string, any>): any {
  const builder = new ExpressionBuilder();
  
  for (const [field, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && '$add' in value) {
      builder.add(field, value.$add);
    } else if (value && typeof value === 'object' && '$remove' in value) {
      builder.remove(field);
    } else if (value && typeof value === 'object' && '$delete' in value) {
      builder.delete(field, value.$delete);
    } else {
      builder.set(field, value);
    }
  }
  
  return builder.build();
}

/**
 * Helper function to build condition expressions
 */
export function buildConditionExpression(conditions: Record<string, any>): any {
  const builder = new ExpressionBuilder();
  
  for (const [field, value] of Object.entries(conditions)) {
    if (value === null) {
      builder.condition(field, 'attribute_not_exists');
    } else if (typeof value === 'object' && '$exists' in value) {
      if (value.$exists) {
        builder.condition(field, 'attribute_exists');
      } else {
        builder.condition(field, 'attribute_not_exists');
      }
    } else {
      builder.condition(field, '=', value);
    }
  }
  
  return builder.build();
}