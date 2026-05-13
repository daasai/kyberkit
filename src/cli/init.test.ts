import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDefaultWorkspace, initProject } from './init.js';
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
    expect(await fs.readFile(path.join(root, '.env'), 'utf-8')).toContain('ANTHROPIC_API_KEY');
    expect(await fs.readFile(path.join(root, 'KK.md'), 'utf-8')).toContain('KK.md');
    expect(await fs.readFile(path.join(root, 'src', 'agent.ts'), 'utf-8')).toContain('KyberRuntime');
    expect(await fs.readFile(path.join(root, 'skills', 'example', 'SKILL.md'), 'utf-8')).toContain('hello_world');
  });

  it('should initialize default workspace under spaces/default', async () => {
    await fs.writeFile(path.join(tmpDir, 'KK.md'), '# Project KK\n\nKevin rules');
    await initDefaultWorkspace();

    const root = path.join(tmpDir, 'spaces', 'default');
    expect((await fs.stat(root)).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'memories'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'skills', 'example'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'commands'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, 'workspaces', 'default'))).isDirectory()).toBe(true);

    const kk = await fs.readFile(path.join(root, 'KK.md'), 'utf-8');
    expect(kk).toContain('Project KK');
    expect(await fs.readFile(path.join(root, 'memories', 'profile.md'), 'utf-8')).toContain('Kevin Profile');
    expect(await fs.readFile(path.join(root, 'skills', 'example', 'SKILL.md'), 'utf-8')).toContain('workspace_example');
  });

  it('should initialize custom workspace user directory without overwriting existing KK.md', async () => {
    const kkPath = path.join(tmpDir, 'spaces', 'User1', 'KK.md');
    await fs.mkdir(path.dirname(kkPath), { recursive: true });
    await fs.writeFile(kkPath, 'Custom User Rules');

    await initDefaultWorkspace('User1');

    expect(await fs.readFile(kkPath, 'utf-8')).toBe('Custom User Rules');
    expect((await fs.stat(path.join(tmpDir, 'spaces', 'User1', 'workspaces', 'default'))).isDirectory()).toBe(true);
  });
});
