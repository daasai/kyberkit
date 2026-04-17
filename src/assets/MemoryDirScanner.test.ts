import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MemoryDirScanner } from './MemoryDirScanner.js';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';

describe('MemoryDirScanner', () => {
  const testDir = './test-memory-dir';

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should scan and parse memory files with frontmatter', async () => {
    const scanner = new MemoryDirScanner();
    
    writeFileSync(join(testDir, 'test1.md'), `---
title: Test Memory
category: user
tags: [test, foo]
---
# Content
Hello world`);

    writeFileSync(join(testDir, 'test2.md'), `no frontmatter here`);
    writeFileSync(join(testDir, 'MEMORY.md'), `index file`); // Should be ignored

    const results = await scanner.scan(testDir);
    
    expect(results).toHaveLength(2);
    
    const test1 = results.find(r => r.path.endsWith('test1.md'));
    expect(test1).toBeDefined();
    expect(test1?.metadata.title).toBe('Test Memory');
    expect(test1?.metadata.category).toBe('user');
    expect(test1?.metadata.tags).toEqual(['test', 'foo']);
    expect(test1?.body.trim()).toBe('# Content\nHello world');
    expect(test1?.lastModified).toBe(statSync(join(testDir, 'test1.md')).mtimeMs);

    const test2 = results.find(r => r.path.endsWith('test2.md'));
    expect(test2).toBeDefined();
    expect(test2?.body.trim()).toBe('no frontmatter here');
    expect(test2?.lastModified).toBe(statSync(join(testDir, 'test2.md')).mtimeMs);
  });

  it('should return empty if directory does not exist', async () => {
    const scanner = new MemoryDirScanner();
    const results = await scanner.scan('./non-existent-dir');
    expect(results).toEqual([]);
  });
});
