import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KKMdLoader } from './KKMdLoader.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('KKMdLoader', () => {
  const rootDir = './test-kk-loader';
  const userDir = join(rootDir, 'user');
  const workspaceDir = join(rootDir, 'workspace');
  const projectDir = join(rootDir, 'project');

  beforeEach(() => {
    mkdirSync(userDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('should load and merge KK.md from three levels', async () => {
    const loader = new KKMdLoader();
    
    writeFileSync(join(userDir, 'KK.md'), 'User Rules');
    writeFileSync(join(workspaceDir, 'KK.md'), 'Workspace Rules');
    writeFileSync(join(projectDir, 'KK.md'), 'Project Rules');

    const result = await loader.load({
      user: userDir,
      workspace: workspaceDir,
      project: projectDir
    });

    expect(result).toContain('User Rules');
    expect(result).toContain('Workspace Rules');
    expect(result).toContain('Project Rules');
    expect(result).toContain('---\n');
    
    // Check order: user -> workspace -> project
    const parts = result?.split('\n\n---\n\n');
    expect(parts?.[0]).toBe('User Rules');
    expect(parts?.[1]).toBe('Workspace Rules');
    expect(parts?.[2]).toBe('Project Rules');
  });

  it('should return null if no KK.md exists', async () => {
    const loader = new KKMdLoader();
    const result = await loader.load({ user: userDir });
    expect(result).toBeNull();
  });
});
