import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initProject } from './init.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('CLI Scaffold (M9)', () => {
  let tmpDir: string;
  let originalCwd: () => string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyber-init-'));
    originalCwd = process.cwd;
    process.cwd = () => tmpDir;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should generate project scaffold in the given directory', async () => {
    const projectName = 'my-agent';
    await initProject(projectName);
    
    const root = path.join(tmpDir, projectName);

    // Verify directories exist
    expect((await fs.stat(path.join(root, 'src', 'tools'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'src', 'prompts'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'skills', 'example'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'mcp'))).isDirectory()).toBe(true);
    
    // Verify files exist
    expect(await fs.readFile(path.join(root, 'kyberkit.config.yaml'), 'utf-8')).toContain('version: "0.1"');
    expect(await fs.readFile(path.join(root, 'package.json'), 'utf-8')).toContain(projectName);
    expect(await fs.readFile(path.join(root, 'src', 'agent.ts'), 'utf-8')).toContain('KyberRuntime');
  });
});
