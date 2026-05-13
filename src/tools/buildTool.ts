import { z } from 'zod';
import type { PermissionResult } from '../types/permission.js';
import type { ToolContext } from '../types/tool.js';
import type { ToolDefinition, ToolResult, ToolUseContext, ValidationResult } from '../types/tool.js';

export type InterruptBehavior = 'cancel' | 'block';

/** Fail-closed defaults aligned with DeepCC Tool trait (§2.2). */
const DEFAULTS = {
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  isEnabled: () => true,
  checkPermissions: async (): Promise<PermissionResult> => ({ behavior: 'allow' }),
};

export interface BuildToolOptions<Input, Output> {
  name: string;
  aliases?: string[];
  searchHint?: string;
  inputSchema: z.ZodType<Input>;
  maxResultSizeChars?: number;
  timeoutMs?: number;
  /** Human-readable description for API + system prompt (static). */
  descriptionText: string;
  searchHint?: string;
  isConcurrencySafe?: (input: Input) => boolean;
  isReadOnly?: (input: Input) => boolean;
  isDestructive?: (input: Input) => boolean;
  validateInput?: (input: Input, ctx: ToolUseContext) => Promise<ValidationResult>;
  checkPermissions?: (input: Input, ctx: ToolUseContext) => Promise<PermissionResult>;
  call: (input: Input, ctx: ToolUseContext) => Promise<ToolResult<Output>>;
}

/**
 * Factory for ToolDefinition with conservative defaults (fail-closed concurrency).
 */
export function buildTool<Input, Output>(opts: BuildToolOptions<Input, Output>): ToolDefinition<Input, Output> {
  const maxResultSizeChars = opts.maxResultSizeChars ?? 100_000;
  return {
    name: opts.name,
    aliases: opts.aliases,
    searchHint: opts.searchHint,
    inputSchema: opts.inputSchema,
    maxResultSizeChars,
    timeoutMs: opts.timeoutMs,
    description: async (_input: Input, _ctx: ToolContext) => opts.descriptionText,
    isConcurrencySafe: opts.isConcurrencySafe ?? DEFAULTS.isConcurrencySafe,
    isReadOnly: opts.isReadOnly ?? DEFAULTS.isReadOnly,
    isDestructive: opts.isDestructive,
    isEnabled: () => true,
    validateInput: opts.validateInput,
    checkPermissions: opts.checkPermissions ?? DEFAULTS.checkPermissions,
    call: opts.call,
  };
}
