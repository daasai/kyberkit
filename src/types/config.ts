import { z } from 'zod';

/**
 * MCPServerConfig defines the connection parameters for an MCP server.
 */
export interface MCPServerConfig {
  readonly name: string;
  readonly transport: 'stdio' | 'sse' | 'streamable-http';
  readonly command?: string;
  readonly args?: string[];
  readonly url?: string;
  readonly trustLevel: 'trusted' | 'sandboxed' | 'untrusted';
}

/**
 * KyberConfig is the root configuration schema for the KyberKit framework.
 */
export const KyberConfigSchema = z.object({
  version: z.string().default('0.1'),
  model: z.object({
    provider: z.string().default('anthropic'),
    name: z.string().default('claude-sonnet-4-20250514'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    maxTokens: z.number().default(4096),
    compactModel: z.string().optional(),
  }),
  compaction: z.object({
    contextWindow: z.number().default(180000),
    hardThreshold: z.number().default(153000),
    softThreshold: z.number().default(117000),
    targetAfterCompact: z.number().default(72000),
    keepRecentRounds: z.number().default(3),
    preferSessionMemory: z.boolean().default(true),
  }).default({}),
  memory: z.object({
    sessionTokenThreshold: z.number().default(4000),
    sessionToolCallThreshold: z.number().default(8),
    /** After each completed assistant turn by default, so L2 notes appear on the next turn. */
    sessionTurnThreshold: z.number().default(1),
    ltmTurnCooldown: z.number().default(3),
    enabled: z.boolean().default(true),
    writeScope: z.enum(['user', 'workspace', 'project']).default('project'),
  }).default({}),
  permissions: z.object({
    allowed: z.array(z.string()).default(['read_fs', 'write_fs', 'exec_shell', 'read_net', 'read_env']),
    denied: z.array(z.string()).default([]),
    allowedPaths: z.array(z.string()).default(['./']),
    allowedDomains: z.array(z.string()).default([]),
  }).default({ allowed: ['read_fs', 'write_fs', 'exec_shell', 'read_net', 'read_env'], denied: [], allowedPaths: ['./'], allowedDomains: [] }),
  mcp: z.object({
    servers: z.array(z.object({
      name: z.string(),
      transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
      command: z.string().optional(),
      args: z.array(z.string()).default([]),
      url: z.string().optional(),
      trustLevel: z.enum(['trusted', 'sandboxed', 'untrusted']).default('sandboxed'),
    })).default([]),
  }).default({ servers: [] }),
  skills: z.object({
    paths: z.array(z.string()).default(['./skills']),
  }).default({ paths: ['./skills'] }),
  /** Tool permission rules (deny wins; evaluated before hooks). */
  tools: z.object({
    deny: z.array(z.object({ tool: z.string(), pattern: z.string() })).default([]),
  }).default({ deny: [] }),
  agent: z.object({
    name: z.string().default('default'),
    systemPrompt: z.string().optional(),
    systemPromptFile: z.string().optional(),
    /** Max time for a single model stream (ms). */
    turnTimeoutMs: z.number().default(120_000),
  }).default({ name: 'default', turnTimeoutMs: 120_000 }),
  /** Local-only analytics (SQLite under .kyberkit/runtime). */
  telemetry: z
    .object({
      trajectory: z
        .object({
          enabled: z.boolean().default(true),
          includeContent: z.boolean().default(true),
        })
        .default({}),
    })
    .default({}),
});

export type KyberConfig = z.infer<typeof KyberConfigSchema>;
