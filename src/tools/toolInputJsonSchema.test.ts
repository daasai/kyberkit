import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { toolInputJsonSchema } from './toolInputJsonSchema.js';

describe('toolInputJsonSchema', () => {
  it('emits type object for empty parameter tools', () => {
    const schema = toolInputJsonSchema(z.object({}));
    expect(schema.type).toBe('object');
    expect(schema.properties).toEqual({});
  });

  it('preserves fields for tools with parameters', () => {
    const schema = toolInputJsonSchema(
      z.object({ path: z.string().optional(), max: z.number().optional() }),
    );
    expect(schema.type).toBe('object');
    expect((schema.properties as Record<string, unknown>).path).toEqual({ type: 'string' });
  });

  it('flattens discriminated unions to a single object schema', () => {
    const schema = toolInputJsonSchema(
      z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('inline'), code: z.string() }),
        z.object({ mode: z.literal('file'), path: z.string() }),
      ]),
    );
    expect(schema.type).toBe('object');
    expect(schema.oneOf).toBeUndefined();
    const props = schema.properties as Record<string, unknown>;
    expect(props.mode).toEqual({ type: 'string', enum: ['inline', 'file'] });
    expect(props.code).toEqual({ type: 'string' });
    expect(props.path).toEqual({ type: 'string' });
  });

  it('flattens python tool schema for DeepSeek-compatible registration', () => {
    const pythonToolInputSchema = z.preprocess(
      (raw) => raw,
      z.discriminatedUnion('mode', [
        z.object({
          mode: z.literal('inline'),
          code: z.string(),
          cwd: z.string().optional(),
        }),
        z.object({
          mode: z.literal('file'),
          path: z.string(),
          args: z.array(z.string()).optional(),
          cwd: z.string().optional(),
        }),
      ]),
    );
    const schema = toolInputJsonSchema(pythonToolInputSchema);
    expect(schema.type).toBe('object');
    expect(schema.required).toBeUndefined();
    const props = schema.properties as Record<string, unknown>;
    expect(props.code).toEqual({ type: 'string' });
    expect(props.path).toEqual({ type: 'string' });
    expect(props.args).toEqual({ type: 'array', items: { type: 'string' } });
  });
});
