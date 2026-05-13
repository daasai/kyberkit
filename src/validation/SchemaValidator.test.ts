import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { SchemaValidator } from './SchemaValidator.js';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  it('should register and validate valid data', () => {
    const userSchema = z.object({
      id: z.number(),
      name: z.string(),
    });
    validator.register('User', userSchema);
    
    const result = validator.validate('User', { id: 1, name: 'Alice' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1, name: 'Alice' });
  });

  it('should return errors for invalid data', () => {
    const userSchema = z.object({
      id: z.number(),
      name: z.string(),
    });
    validator.register('User', userSchema);
    
    const result = validator.validate('User', { id: 'invalid', name: 123 });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.errors?.[0].path).toContain('id');
    expect(result.errors?.[1].path).toContain('name');
  });

  it('should throw error for duplicate registration', () => {
    const schema = z.string();
    validator.register('test', schema);
    expect(() => validator.register('test', schema)).toThrow(/already registered/);
  });

  it('should validate a batch of entries', () => {
    validator.register('id', z.number());
    validator.register('tag', z.string());

    const results = validator.validateBatch([
      { name: 'id', data: 123 },
      { name: 'tag', data: 'valid' },
      { name: 'id', data: 'invalid' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(false);
  });

  it('should return error when schema is not found', () => {
    const result = validator.validate('Missing', {});
    expect(result.success).toBe(false);
    expect(result.errors?.[0].code).toBe('SCHEMA_NOT_FOUND');
  });
});
