import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MemoryDirScanner } from './MemoryDirScanner.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('MemoryDirScanner', () => {
  const root = './test-data-scanner';
  let scanner: MemoryDirScanner;

  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    scanner = new MemoryDirScanner();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] for non-existent directories', async () => {
    expect(await scanner.scan(root)).toEqual([]);
  });

  it('parses flat .md files and skips MEMORY.md', async () => {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'alpha.md'),
      '---\ntitle: Alpha\ntags: [a]\n---\n\nAlpha body.\n',
    );
    await writeFile(join(root, 'MEMORY.md'), '# index');
    const out = await scanner.scan(root);
    expect(out).toHaveLength(1);
    expect(out[0].metadata.title).toBe('Alpha');
  });

  it('descends into category sub-directories (Sprint 4 layout)', async () => {
    await mkdir(join(root, 'user'), { recursive: true });
    await mkdir(join(root, 'project'), { recursive: true });
    await writeFile(
      join(root, 'user', 'prefers-bun.md'),
      '---\ntitle: Prefers Bun\n---\n\nbun > node\n',
    );
    await writeFile(
      join(root, 'project', 'no-sqlite.md'),
      '---\ntitle: No SQLite\ncategory: project\n---\n\nno sqlite\n',
    );

    const out = await scanner.scan(root);
    expect(out).toHaveLength(2);

    const byCat = new Map(out.map((e) => [e.metadata.title, e.metadata.category]));
    expect(byCat.get('Prefers Bun')).toBe('user');
    expect(byCat.get('No SQLite')).toBe('project');
  });

  it('combines flat + subdir files in a single scan', async () => {
    await mkdir(join(root, 'user'), { recursive: true });
    await writeFile(
      join(root, 'legacy.md'),
      '---\ntitle: Legacy Flat\n---\n\nold layout\n',
    );
    await writeFile(
      join(root, 'user', 'new.md'),
      '---\ntitle: Modern User\n---\n\nnew layout\n',
    );

    const out = await scanner.scan(root);
    expect(out).toHaveLength(2);
  });
});
