import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KyberRuntime } from './KyberRuntime.js';
import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ReliabilityLayer } from '../agent/AgentLoop.js';

describe('KyberRuntime (M8)', () => {
  // Save and restore env vars
  let savedEnv: Record<string, string | undefined> = {};
  let sandboxDir: string;
  let originalCwd: () => string;

  beforeEach(async () => {
    savedEnv = {
      KYBER_MODEL_PROVIDER: process.env.KYBER_MODEL_PROVIDER,
      KYBER_MODEL_NAME: process.env.KYBER_MODEL_NAME,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      KYBER_USER_NAME: process.env.KYBER_USER_NAME,
      KYBER_WORKSPACE_ID: process.env.KYBER_WORKSPACE_ID,
      KYBER_SPACES_ROOT: process.env.KYBER_SPACES_ROOT,
    };
    sandboxDir = await mkdtemp(join(tmpdir(), 'kyber-runtime-'));
    originalCwd = process.cwd;
    process.cwd = () => sandboxDir;

    process.env.KYBER_MODEL_PROVIDER = 'anthropic';
    process.env.KYBER_MODEL_NAME = 'claude-sonnet-4-20250514';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.KYBER_USER_NAME = 'default';
    process.env.KYBER_WORKSPACE_ID = 'default';
    delete process.env.KYBER_SPACES_ROOT;
    // Clear MCP env vars
    delete process.env.KYBER_MCP_SERVER_1_NAME;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(sandboxDir, { recursive: true, force: true });

    // Restore env vars
    if (savedEnv.KYBER_MODEL_PROVIDER !== undefined) {
      process.env.KYBER_MODEL_PROVIDER = savedEnv.KYBER_MODEL_PROVIDER;
    } else {
      delete process.env.KYBER_MODEL_PROVIDER;
    }
    if (savedEnv.KYBER_MODEL_NAME !== undefined) {
      process.env.KYBER_MODEL_NAME = savedEnv.KYBER_MODEL_NAME;
    } else {
      delete process.env.KYBER_MODEL_NAME;
    }
    if (savedEnv.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedEnv.ANTHROPIC_API_KEY;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedEnv.KYBER_USER_NAME !== undefined) {
      process.env.KYBER_USER_NAME = savedEnv.KYBER_USER_NAME;
    } else {
      delete process.env.KYBER_USER_NAME;
    }
    if (savedEnv.KYBER_WORKSPACE_ID !== undefined) {
      process.env.KYBER_WORKSPACE_ID = savedEnv.KYBER_WORKSPACE_ID;
    } else {
      delete process.env.KYBER_WORKSPACE_ID;
    }
    if (savedEnv.KYBER_SPACES_ROOT !== undefined) {
      process.env.KYBER_SPACES_ROOT = savedEnv.KYBER_SPACES_ROOT;
    } else {
      delete process.env.KYBER_SPACES_ROOT;
    }
    delete process.env.KYBER_MCP_SERVER_1_NAME;
  });

  it('should bootstrap runtime from environment variables', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    expect(runtime.getConfig().model.provider).toBe('anthropic');
    expect(runtime.getConfig().model.apiKey).toBe('test-key');
    expect(runtime.getModel()).toBeDefined();
    expect(runtime.getSandbox()).toBeDefined();
    expect(runtime.getTools()).toBeDefined();
    expect(runtime.getBus()).toBeDefined();
  });

  it('should create an agent instance', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const agent = runtime.createAgent();
    expect(agent.id).toBeDefined();
    expect(agent.status).toBe('created');
  });

  it('should create middleware pipeline', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const pipeline = runtime.createMiddlewarePipeline();
    expect(pipeline.size).toBe(3); // TokenCounter + ContentAccumulator + Narrator
  });

  it('should create agent loop deps with workspace components', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const agent = runtime.createAgent();
    const deps = runtime.createAgentLoopDeps(agent, {} as unknown as ReliabilityLayer);

    expect(deps.agent).toBe(agent);
    expect(deps.model).toBe(runtime.getModel());
    expect(deps.tools).toBe(runtime.getTools());
    expect(deps.sandbox).toBe(runtime.getSandbox());
    expect(deps.pipeline.size).toBe(4); // TokenCounter + ContentAccumulator + Narrator + OutputGuard
    
    // Sprint 2 verification
    expect(deps.promptAssembler).toBeDefined();
    expect(deps.commandRegistry).toBeDefined();
    expect(deps.workspace).toBeDefined();
    expect(deps.workspace?.config.workspaceId).toBe('default');
  });

  it('should provide the active workspace', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();
    
    const ws = runtime.getActiveWorkspace();
    expect(ws.config.workspaceId).toBe('default');
    expect(ws.promptAssembler).toBeDefined();
    expect(ws.commandRegistry).toBeDefined();
  });

  it('should seed default workspace assets under spaces/default', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const userRoot = join(sandboxDir, 'spaces', 'default');
    expect((await stat(join(userRoot, 'KK.md'))).isFile()).toBe(true);
    expect((await stat(join(userRoot, 'memories', 'profile.md'))).isFile()).toBe(true);
    expect((await stat(join(userRoot, 'skills', 'example', 'SKILL.md'))).isFile()).toBe(true);
    expect((await stat(join(userRoot, 'commands', 'README.md'))).isFile()).toBe(true);
    expect((await stat(join(userRoot, 'workspaces', 'default'))).isDirectory()).toBe(true);
  });
});

