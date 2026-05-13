import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig } from './ConfigLoader.js';

describe('ConfigLoader (env-based)', () => {
  let savedEnv: Record<string, string | undefined> = {};

  const saveEnv = () => {
    savedEnv = {
      KYBER_MODEL_PROVIDER: process.env.KYBER_MODEL_PROVIDER,
      KYBER_MODEL_NAME: process.env.KYBER_MODEL_NAME,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      KYBER_MODEL_BASE_URL: process.env.KYBER_MODEL_BASE_URL,
      KYBER_MODEL_MAX_TOKENS: process.env.KYBER_MODEL_MAX_TOKENS,
      KYBER_AGENT_NAME: process.env.KYBER_AGENT_NAME,
      KYBER_AGENT_SYSTEM_PROMPT: process.env.KYBER_AGENT_SYSTEM_PROMPT,
      KYBER_AGENT_SYSTEM_PROMPT_FILE: process.env.KYBER_AGENT_SYSTEM_PROMPT_FILE,
      KYBER_PERMS_ALLOWED: process.env.KYBER_PERMS_ALLOWED,
      KYBER_PERMS_DENIED: process.env.KYBER_PERMS_DENIED,
      KYBER_PERMS_ALLOWED_PATHS: process.env.KYBER_PERMS_ALLOWED_PATHS,
      KYBER_PERMS_ALLOWED_DOMAINS: process.env.KYBER_PERMS_ALLOWED_DOMAINS,
      KYBER_SKILL_PATHS: process.env.KYBER_SKILL_PATHS,
      KYBER_MCP_SERVER_1_NAME: process.env.KYBER_MCP_SERVER_1_NAME,
      KYBER_MCP_SERVER_1_TRANSPORT: process.env.KYBER_MCP_SERVER_1_TRANSPORT,
      KYBER_MCP_SERVER_1_COMMAND: process.env.KYBER_MCP_SERVER_1_COMMAND,
      KYBER_MCP_SERVER_1_ARGS: process.env.KYBER_MCP_SERVER_1_ARGS,
      KYBER_MCP_SERVER_1_URL: process.env.KYBER_MCP_SERVER_1_URL,
      KYBER_MCP_SERVER_1_TRUST: process.env.KYBER_MCP_SERVER_1_TRUST,
    };
  };

  const clearEnv = () => {
    delete process.env.KYBER_MODEL_PROVIDER;
    delete process.env.KYBER_MODEL_NAME;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.KYBER_MODEL_BASE_URL;
    delete process.env.KYBER_MODEL_MAX_TOKENS;
    delete process.env.KYBER_AGENT_NAME;
    delete process.env.KYBER_AGENT_SYSTEM_PROMPT;
    delete process.env.KYBER_AGENT_SYSTEM_PROMPT_FILE;
    delete process.env.KYBER_PERMS_ALLOWED;
    delete process.env.KYBER_PERMS_DENIED;
    delete process.env.KYBER_PERMS_ALLOWED_PATHS;
    delete process.env.KYBER_PERMS_ALLOWED_DOMAINS;
    delete process.env.KYBER_SKILL_PATHS;
    delete process.env.KYBER_MCP_SERVER_1_NAME;
    delete process.env.KYBER_MCP_SERVER_1_TRANSPORT;
    delete process.env.KYBER_MCP_SERVER_1_COMMAND;
    delete process.env.KYBER_MCP_SERVER_1_ARGS;
    delete process.env.KYBER_MCP_SERVER_1_URL;
    delete process.env.KYBER_MCP_SERVER_1_TRUST;
  };

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  };

  beforeEach(() => {
    saveEnv();
    clearEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should load config with defaults when only API key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const config = await loadConfig();
    expect(config.model.provider).toBe('anthropic');
    expect(config.model.name).toBe('claude-sonnet-4-20250514');
    expect(config.model.apiKey).toBe('sk-test-key');
    expect(config.model.maxTokens).toBe(4096);
    expect(config.permissions.allowed.length).toBeGreaterThan(0);
    expect(config.skills.paths).toEqual(['./skills']);
    expect(config.agent.name).toBe('default');
  });

  it('should use custom model settings from env vars', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KYBER_MODEL_PROVIDER = 'anthropic';
    process.env.KYBER_MODEL_NAME = 'claude-haiku-35-20241022';
    process.env.KYBER_MODEL_MAX_TOKENS = '8192';
    process.env.KYBER_MODEL_BASE_URL = 'https://api.example.com';

    const config = await loadConfig();
    expect(config.model.name).toBe('claude-haiku-35-20241022');
    expect(config.model.maxTokens).toBe(8192);
    expect(config.model.baseUrl).toBe('https://api.example.com');
  });

  it('should parse comma-separated lists', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KYBER_PERMS_ALLOWED = 'read_fs,exec_shell';
    process.env.KYBER_PERMS_DENIED = 'write_fs';
    process.env.KYBER_PERMS_ALLOWED_PATHS = '/home,/tmp';
    process.env.KYBER_SKILL_PATHS = './skills,./custom-skills';

    const config = await loadConfig();
    expect(config.permissions.allowed).toEqual(['read_fs', 'exec_shell']);
    expect(config.permissions.denied).toEqual(['write_fs']);
    expect(config.permissions.allowedPaths).toEqual(['/home', '/tmp']);
    expect(config.skills.paths).toEqual(['./skills', './custom-skills']);
  });

  it('should parse MCP servers from indexed env vars', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KYBER_MCP_SERVER_1_NAME = 'filesystem';
    process.env.KYBER_MCP_SERVER_1_TRANSPORT = 'stdio';
    process.env.KYBER_MCP_SERVER_1_COMMAND = 'npx';
    process.env.KYBER_MCP_SERVER_1_ARGS = '-y,@mcp/server-fs,/path/to/dir';
    process.env.KYBER_MCP_SERVER_1_TRUST = 'sandboxed';

    const config = await loadConfig();
    expect(config.mcp.servers).toHaveLength(1);
    const server = config.mcp.servers[0];
    expect(server.name).toBe('filesystem');
    expect(server.transport).toBe('stdio');
    expect(server.command).toBe('npx');
    expect(server.args).toEqual(['-y', '@mcp/server-fs', '/path/to/dir']);
    expect(server.trustLevel).toBe('sandboxed');
  });

  it('should parse multiple MCP servers', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KYBER_MCP_SERVER_1_NAME = 'fs';
    process.env.KYBER_MCP_SERVER_2_NAME = 'github';
    process.env.KYBER_MCP_SERVER_2_URL = 'http://localhost:3001';
    process.env.KYBER_MCP_SERVER_2_TRANSPORT = 'sse';

    const config = await loadConfig();
    expect(config.mcp.servers).toHaveLength(2);
    expect(config.mcp.servers[0].name).toBe('fs');
    expect(config.mcp.servers[1].name).toBe('github');
  });

  it('should support custom agent config', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KYBER_AGENT_NAME = 'bob';
    process.env.KYBER_AGENT_SYSTEM_PROMPT = 'You are Bob, a helpful assistant.';

    const config = await loadConfig();
    expect(config.agent.name).toBe('bob');
    expect(config.agent.systemPrompt).toBe('You are Bob, a helpful assistant.');
  });

  it('should support resolveEnvVars (deprecated but still works)', async () => {
    process.env.TEST_VAR = 'hello';
    const { resolveEnvVars } = await import('./ConfigLoader.js');
    const resolved = resolveEnvVars('Value is ${TEST_VAR}.');
    expect(resolved).toBe('Value is hello.');
  });
});
