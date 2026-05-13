import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DefaultAssetRegistry } from './AssetRegistry.js';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';

describe('DefaultAssetRegistry', () => {
  const rootDir = './test-asset-registry';
  const userDir = join(rootDir, 'user');
  const projectDir = join(rootDir, 'project');

  beforeEach(() => {
    mkdirSync(userDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(userDir, 'memories'), { recursive: true });
    mkdirSync(join(projectDir, 'memories'), { recursive: true });
    mkdirSync(join(userDir, 'skills', 'example'), { recursive: true });
    mkdirSync(join(userDir, 'commands'), { recursive: true });
    mkdirSync(join(projectDir, 'commands'), { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('should scan and manifest assets from multiple scopes', async () => {
    const registry = new DefaultAssetRegistry();
    
    writeFileSync(join(userDir, 'KK.md'), 'User KK');
    writeFileSync(join(projectDir, 'KK.md'), 'Project KK');
    writeFileSync(join(userDir, 'memories/m1.md'), 'Memory 1');
    writeFileSync(join(projectDir, 'memories/m2.md'), 'Memory 2');
    writeFileSync(join(userDir, 'skills/example/SKILL.md'), '# Skill');
    writeFileSync(join(projectDir, 'commands/review.md'), '# Command');

    const manifest = await registry.scan({
      user: userDir,
      project: projectDir
    });

    expect(manifest.entries).toHaveLength(6);
    expect(registry.getMergedKKMd()).toContain('User KK');
    expect(registry.getMergedKKMd()).toContain('Project KK');
    
    const memories = registry.getMemories();
    expect(memories).toHaveLength(2);
    expect(memories.find(m => m.scope === 'user')).toBeDefined();
    expect(memories.find(m => m.scope === 'project')).toBeDefined();
    expect(manifest.entries.find(entry => entry.type === 'skill')?.relativePath).toBe('skills/example/SKILL.md');
    expect(manifest.entries.find(entry => entry.type === 'command')?.relativePath).toBe('commands/review.md');
  });

  it('should filter assets by query', async () => {
    const registry = new DefaultAssetRegistry();
    writeFileSync(join(userDir, 'KK.md'), 'User KK');
    writeFileSync(join(userDir, 'memories/m1.md'), 'Memory 1');

    await registry.scan({ user: userDir });

    const kkOnly = registry.query({ type: 'kk_md' });
    expect(kkOnly).toHaveLength(1);
    expect(kkOnly[0].type).toBe('kk_md');

    const userOnly = registry.query({ scope: 'user' });
    expect(userOnly).toHaveLength(2);
  });

  it('should use real file mtimes for scanned entries', async () => {
    const registry = new DefaultAssetRegistry();
    const kkPath = join(userDir, 'KK.md');
    const memoryPath = join(userDir, 'memories/m1.md');

    writeFileSync(kkPath, 'User KK');
    writeFileSync(memoryPath, 'Memory 1');

    const manifest = await registry.scan({ user: userDir });
    const kkEntry = manifest.entries.find(entry => entry.absolutePath === kkPath);
    const memoryEntry = manifest.entries.find(entry => entry.absolutePath === memoryPath);

    expect(kkEntry?.lastModified).toBe(statSync(kkPath).mtimeMs);
    expect(memoryEntry?.lastModified).toBe(statSync(memoryPath).mtimeMs);
  });

  it('should classify watched asset paths and create watched entries', () => {
    const registry = new DefaultAssetRegistry();
    const kkPath = join(userDir, 'KK.md');
    writeFileSync(kkPath, 'User KK');
    writeFileSync(join(userDir, 'skills/example/SKILL.md'), '# Skill');
    writeFileSync(join(userDir, 'commands/custom.md'), '# Command');

    const internalRegistry = registry as any;
    const disposable = registry.watch({ user: userDir }, () => {});

    expect(internalRegistry.detectAssetType('KK.md')).toBe('kk_md');
    expect(internalRegistry.detectAssetType('skills/example/SKILL.md')).toBe('skill');
    expect(internalRegistry.detectAssetType('commands/custom.md')).toBe('command');

    const kkEntry = internalRegistry.createWatchedAssetEntry(userDir, 'user', kkPath, 'KK.md', 'kk_md', true);
    const removedEntry = internalRegistry.createWatchedAssetEntry(userDir, 'user', join(userDir, 'commands/missing.md'), 'commands/missing.md', 'command', false);

    disposable.dispose();

    expect(kkEntry.relativePath).toBe('KK.md');
    expect(kkEntry.type).toBe('kk_md');
    expect(kkEntry.lastModified).toBe(statSync(kkPath).mtimeMs);

    expect(removedEntry.relativePath).toBe('commands/missing.md');
    expect(removedEntry.type).toBe('command');
    expect(removedEntry.lastModified).toBe(0);
  });
});
