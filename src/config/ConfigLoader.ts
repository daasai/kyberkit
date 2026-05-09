import { KyberConfig, KyberConfigSchema } from '../types/config.js';
import { ConfigError } from '../types/errors.js';

/**
 * Loads KyberKit configuration from environment variables.
 *
 * All configuration is read from environment variables with sensible defaults.
 * The `.env` file in the project root is the single source of truth.
 * Bun automatically loads `.env` before executing scripts.
 *
 * Environment Variables:
 *   Model (Kevin v1.5 §8.4 — Anthropic SDK 一统; KYBER_MODEL_PROVIDER 已废弃):
 *     KYBER_MODEL_NAME           - Model identifier (default: 'claude-sonnet-4-20250514')
 *     ANTHROPIC_API_KEY          - API key (required for Anthropic provider)
 *     KYBER_MODEL_BASE_URL       - Custom API base URL (optional, supports compatible gateways)
 *     KYBER_MODEL_MAX_TOKENS     - Max tokens per response (default: 4096)
 *
 *   Agent:
 *     KYBER_AGENT_NAME           - Agent name (default: 'default')
 *     KYBER_AGENT_SYSTEM_PROMPT  - System prompt for agent behavior (optional)
 *     KYBER_AGENT_SYSTEM_PROMPT_FILE - Path to file containing system prompt (optional)
 *
 *   Permissions:
 *     KYBER_PERMS_ALLOWED         - Comma-separated allowed permissions
 *     KYBER_PERMS_DENIED          - Comma-separated denied permissions
 *     KYBER_PERMS_ALLOWED_PATHS   - Comma-separated allowed file paths
 *     KYBER_PERMS_ALLOWED_DOMAINS - Comma-separated allowed domains
 *
 *   Skills:
 *     KYBER_SKILL_PATHS          - Comma-separated skill directory paths
 *
 *   Memory (L2 session distill / L3 triggers):
 *     KYBER_MEMORY_ENABLED                    - 'false' to disable memory middleware
 *     KYBER_MEMORY_SESSION_TURN_THRESHOLD     - Turns before session note extraction (default: 1)
 *     KYBER_MEMORY_SESSION_TOKEN_THRESHOLD    - Token accumulation trigger (default: 4000)
 *     KYBER_MEMORY_SESSION_TOOL_CALL_THRESHOLD- Tool-call count trigger (default: 8)
 *
 *   Telemetry (local SQLite trajectory):
 *     KYBER_TELEMETRY_TRAJECTORY_ENABLED       - 'false' to disable (default: on)
 *     KYBER_TELEMETRY_TRAJECTORY_INCLUDE_CONTENT - 'false' to store hashes only
 *
 *   MCP Servers:
 *     KYBER_MCP_SERVER_N_NAME      - Server name (N = 1, 2, ...)
 *     KYBER_MCP_SERVER_N_TRANSPORT - Transport type (stdio/sse/streamable-http)
 *     KYBER_MCP_SERVER_N_COMMAND   - Command to run (for stdio)
 *     KYBER_MCP_SERVER_N_ARGS      - Comma-separated arguments
 *     KYBER_MCP_SERVER_N_URL       - Server URL (for sse/streamable-http)
 *     KYBER_MCP_SERVER_N_TRUST     - Trust level (trusted/sandboxed/untrusted)
 */
export async function loadConfig(): Promise<KyberConfig> {
  const rawData = buildConfigFromEnv();
  const result = KyberConfigSchema.safeParse(rawData);
  if (!result.success) {
    throw new ConfigError(`Invalid config: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Build configuration object from environment variables.
 * Zod schema defaults fill in any missing values.
 */
function buildConfigFromEnv(): Record<string, unknown> {
  const parseList = (val?: string): string[] | undefined =>
    val ? val.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  const parseNum = (val?: string): number | undefined =>
    val ? parseInt(val, 10) : undefined;

  const parseToolDeny = (): Array<{ tool: string; pattern: string }> | undefined => {
    const raw = process.env.KYBER_TOOLS_DENY;
    if (!raw?.trim()) return undefined;
    try {
      const v = JSON.parse(raw) as unknown;
      if (!Array.isArray(v)) return undefined;
      return v.filter(
        (x): x is { tool: string; pattern: string } =>
          typeof x === 'object' &&
          x !== null &&
          typeof (x as any).tool === 'string' &&
          typeof (x as any).pattern === 'string',
      );
    } catch {
      return undefined;
    }
  };

  // Kevin v1.5 §8.4 — KYBER_MODEL_PROVIDER deprecated; always Anthropic SDK (default in schema).
  return {
    model: {
      // provider intentionally omitted; KyberConfigSchema defaults to 'anthropic'.
      name: process.env.KYBER_MODEL_NAME,
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.KYBER_API_KEY,
      baseUrl: process.env.KYBER_MODEL_BASE_URL,
      maxTokens: parseNum(process.env.KYBER_MODEL_MAX_TOKENS),
      compactModel: process.env.KYBER_COMPACT_MODEL,
    },
    compaction: {
      contextWindow: parseNum(process.env.KYBER_COMPACTION_CONTEXT_WINDOW),
      hardThreshold: parseNum(process.env.KYBER_COMPACTION_HARD_THRESHOLD),
      softThreshold: parseNum(process.env.KYBER_COMPACTION_SOFT_THRESHOLD),
      targetAfterCompact: parseNum(process.env.KYBER_COMPACTION_TARGET),
      keepRecentRounds: parseNum(process.env.KYBER_COMPACTION_KEEP_ROUNDS),
      preferSessionMemory:
        process.env.KYBER_COMPACTION_PREFER_SESSION === undefined
          ? undefined
          : process.env.KYBER_COMPACTION_PREFER_SESSION === 'true',
    },
    memory: {
      sessionTokenThreshold: parseNum(process.env.KYBER_MEMORY_SESSION_TOKEN_THRESHOLD),
      sessionToolCallThreshold: parseNum(process.env.KYBER_MEMORY_SESSION_TOOL_CALL_THRESHOLD),
      sessionTurnThreshold: parseNum(process.env.KYBER_MEMORY_SESSION_TURN_THRESHOLD),
      ltmTurnCooldown: parseNum(process.env.KYBER_MEMORY_LTM_TURN_COOLDOWN),
      enabled:
        process.env.KYBER_MEMORY_ENABLED === undefined
          ? undefined
          : process.env.KYBER_MEMORY_ENABLED !== 'false',
      writeScope: process.env.KYBER_MEMORY_WRITE_SCOPE as
        | 'user' | 'workspace' | 'project' | undefined,
    },
    permissions: {
      allowed: parseList(process.env.KYBER_PERMS_ALLOWED),
      denied: parseList(process.env.KYBER_PERMS_DENIED),
      allowedPaths: parseList(process.env.KYBER_PERMS_ALLOWED_PATHS),
      allowedDomains: parseList(process.env.KYBER_PERMS_ALLOWED_DOMAINS),
    },
    mcp: {
      servers: parseMcpServers(),
    },
    skills: {
      paths: parseList(process.env.KYBER_SKILL_PATHS),
    },
    tools: {
      deny: parseToolDeny(),
    },
    agent: {
      name: process.env.KYBER_AGENT_NAME,
      systemPrompt: process.env.KYBER_AGENT_SYSTEM_PROMPT,
      systemPromptFile: process.env.KYBER_AGENT_SYSTEM_PROMPT_FILE,
      turnTimeoutMs: parseNum(process.env.KYBER_AGENT_TURN_TIMEOUT_MS),
    },
    telemetry: {
      trajectory: {
        enabled:
          process.env.KYBER_TELEMETRY_TRAJECTORY_ENABLED === undefined
            ? undefined
            : process.env.KYBER_TELEMETRY_TRAJECTORY_ENABLED !== 'false',
        includeContent:
          process.env.KYBER_TELEMETRY_TRAJECTORY_INCLUDE_CONTENT === undefined
            ? undefined
            : process.env.KYBER_TELEMETRY_TRAJECTORY_INCLUDE_CONTENT !== 'false',
      },
    },
  };
}

/**
 * Scan environment for KYBER_MCP_SERVER_N_* entries and build MCP server configs.
 * Server indices start at 1 and increment until no server with that index is found.
 */
function parseMcpServers(): Array<{
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  trustLevel: 'trusted' | 'sandboxed' | 'untrusted';
}> {
  const servers: Array<Record<string, unknown>> = [];
  let index = 1;

  while (true) {
    const nameKey = `KYBER_MCP_SERVER_${index}_NAME`;
    const name = process.env[nameKey];
    if (!name) break; // No more servers

    const transport = (process.env[`KYBER_MCP_SERVER_${index}_TRANSPORT`] || 'stdio') as 'stdio' | 'sse' | 'streamable-http';
    const command = process.env[`KYBER_MCP_SERVER_${index}_COMMAND`];
    const argsRaw = process.env[`KYBER_MCP_SERVER_${index}_ARGS`];
    const args = argsRaw ? argsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const url = process.env[`KYBER_MCP_SERVER_${index}_URL`];
    const trustLevel = (process.env[`KYBER_MCP_SERVER_${index}_TRUST`] || 'sandboxed') as 'trusted' | 'sandboxed' | 'untrusted';

    servers.push({ name, transport, command, args, url, trustLevel });
    index++;
  }

  return servers;
}

/**
 * @deprecated No longer needed — config is now read directly from environment variables.
 * Kept for backward compatibility with any code that still calls it.
 */
export function resolveEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] ?? '';
  });
}
