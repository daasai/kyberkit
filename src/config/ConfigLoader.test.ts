import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig, resolveEnvVars } from './ConfigLoader.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader (M7)', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyber-config-'));
    configPath = path.join(tmpDir, 'kyberkit.yaml');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Cleanup any env vars
    delete process.env.TEST_API_KEY;
  });

  it('should load and validate a standard YAML config', async () => {
    await fs.writeFile(configPath, `
version: "0.1"
model:
  provider: "anthropic"
  name: "claude-sonnet-4-20250514"
agent:
  name: "bob"
`);

    const config = await loadConfig(configPath);
    expect(config.version).toBe('0.1');
    expect(config.model.provider).toBe('anthropic');
    expect(config.agent.name).toBe('bob');
    
    // Check defaults
    expect(config.permissions.allowed.length).toBeGreaterThan(0);
    expect(config.skills.paths).toEqual(['./skills']);
  });

  it('should resolve environment variables in the config before validation', async () => {
    process.env.TEST_API_KEY = 'sk-12345';
    await fs.writeFile(configPath, `
model:
  apiKey: "\${TEST_API_KEY}"
`);

    const config = await loadConfig(configPath);
    expect(config.model.apiKey).toBe('sk-12345');
  });

  it('should throw ConfigError when YAML is malformed or invalid', async () => {
    await fs.writeFile(configPath, `
version: [invalid yaml
`);
    expect(loadConfig(configPath)).rejects.toThrow();

    await fs.writeFile(configPath, `
model:
  maxTokens: "not a number"
`);
    expect(loadConfig(configPath)).rejects.toThrow();
  });

  it('should support resolveEnvVars separately', () => {
    process.env.TEST_VAR = 'hello';
    const resolved = resolveEnvVars('The value is ${TEST_VAR} and normal val.');
    expect(resolved).toBe('The value is hello and normal val.');
  });
});
