import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { KyberRuntime } from './KyberRuntime.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('KyberRuntime (M8)', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyber-runtime-'));
    configPath = path.join(tmpDir, 'kyberkit.yaml');
    
    // Create a dummy config
    await fs.writeFile(configPath, `
version: "0.1"
model:
  provider: "anthropic"
  apiKey: "test-key"
`);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should bootstrap runtime from config file', async () => {
    const runtime = new KyberRuntime();
    
    // We expect MCP listTools etc. to just work since we'll mock or avoid connections in tests
    // For pure unit test, we might want to mock the registries, but we can also just run it 
    // to see if it instantiates components.
    
    // Actually we need to avoid real MCP connections in full unit tests.
    // For now, let's just make sure it loads config and initializes without MCP servers.
    await runtime.bootstrap(configPath);
    
    expect(runtime.getConfig().version).toBe("0.1");
    expect(runtime.getModel()).toBeDefined();
    expect(runtime.getSandbox()).toBeDefined();
    expect(runtime.getTools()).toBeDefined();
    expect(runtime.getBus()).toBeDefined();
  });

  it('should create an agent instance', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap(configPath);
    
    const agent = runtime.createAgent();
    expect(agent.id).toBeDefined();
    expect(agent.status).toBe('created');
  });
});
