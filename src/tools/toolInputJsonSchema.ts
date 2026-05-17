import { z } from 'zod';

export type ToolInputJsonSchema = Record<string, unknown>;

type JsonSchemaFragment = Record<string, unknown>;

/**
 * Convert a tool Zod input schema to JSON Schema for Anthropic-compatible APIs.
 * Gateways such as DeepSeek require top-level `type: "object"` (no bare oneOf).
 */
export function toolInputJsonSchema(schema: z.ZodType): ToolInputJsonSchema {
  const raw = z.toJSONSchema(schema) as JsonSchemaFragment;
  const cleaned = { ...raw };
  delete cleaned.$schema;
  delete cleaned['~standard'];

  if (cleaned.type === 'object') {
    return cleaned;
  }

  const variants = cleaned.oneOf ?? cleaned.anyOf;
  if (Array.isArray(variants)) {
    return flattenVariantsToObject(variants);
  }

  return { type: 'object', properties: {}, additionalProperties: false };
}

function flattenVariantsToObject(variants: unknown[]): ToolInputJsonSchema {
  const properties: Record<string, unknown> = {};

  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    const v = variant as JsonSchemaFragment;
    if (v.type !== 'object' || !v.properties || typeof v.properties !== 'object') continue;

    for (const [key, propSchema] of Object.entries(v.properties as Record<string, unknown>)) {
      properties[key] = mergePropertySchema(properties[key], propSchema);
    }
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

function mergePropertySchema(
  existing: unknown,
  incoming: unknown,
): unknown {
  if (existing === undefined) return incoming;
  if (incoming === undefined) return existing;
  if (deepEqual(existing, incoming)) return existing;

  const a = existing as JsonSchemaFragment;
  const b = incoming as JsonSchemaFragment;

  const aConst = a.const;
  const bConst = b.const;
  if (aConst !== undefined && bConst !== undefined && aConst !== bConst) {
    const values = new Set<unknown>([
      ...(Array.isArray(a.enum) ? a.enum : [aConst]),
      ...(Array.isArray(b.enum) ? b.enum : [bConst]),
    ]);
    return { type: 'string', enum: [...values] };
  }

  return { ...a, ...b };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
