import { z, ZodType } from 'zod';

export interface SchemaValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: SchemaValidationError[];
}

export interface SchemaValidationError {
  path: (string | number)[];
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

/**
 * [R3] SchemaValidator provides a global registry for Zod schemas
 * and validates data against them.
 * 
 * Usage: Register once during bootstrap, validate everywhere.
 */
export class SchemaValidator {
  private schemas = new Map<string, ZodType>();

  /**
   * Registers a schema with a unique name.
   * Throws if name already registered.
   */
  register(name: string, schema: ZodType): void {
    if (this.schemas.has(name)) {
      throw new Error(`Schema "${name}" already registered.`);
    }
    this.schemas.set(name, schema);
  }

  /**
   * Validates data against a named schema.
   * [R3] Consistency: Returns structured errors if validation fails.
   */
  validate<T>(name: string, data: unknown): SchemaValidationResult<T> {
    const schema = this.schemas.get(name);
    if (!schema) {
      return {
        success: false,
        errors: [{ path: [], message: `Schema "${name}" not found`, code: 'SCHEMA_NOT_FOUND' }]
      };
    }
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data as T };
    }
    return {
      success: false,
      errors: result.error.issues.map(issue => ({
        path: issue.path as (string | number)[],
        message: issue.message,
        code: issue.code,
        expected: (issue as any).expected,
        received: (issue as any).received,
      })),
    };
  }

  /**
   * Validates a batch of entries.
   */
  validateBatch(entries: Array<{ name: string; data: unknown }>): SchemaValidationResult[] {
    return entries.map(({ name, data }) => this.validate(name, data));
  }

  has(name: string): boolean {
    return this.schemas.has(name);
  }

  listRegistered(): string[] {
    return [...this.schemas.keys()];
  }
}
