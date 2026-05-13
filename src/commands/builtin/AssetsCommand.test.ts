import { describe, it, expect } from 'bun:test';
import { AssetsCommand } from './AssetsCommand.js';
import type { AssetEntry } from '../../types/assets.js';

function makeMemory(id: string, scope: 'user' | 'workspace' | 'project', category: string, title: string): AssetEntry {
  return {
    id,
    type: 'memory',
    scope,
    absolutePath: `/tmp/${id}.md`,
    relativePath: `memories/${category}/${id}.md`,
    lastModified: Date.now(),
    metadata: { title, category },
  };
}

function makeSkill(id: string, title: string): AssetEntry {
  return {
    id,
    type: 'skill',
    scope: 'workspace',
    absolutePath: `/tmp/${id}/SKILL.md`,
    relativePath: `skills/${id}/SKILL.md`,
    lastModified: Date.now(),
    metadata: { title },
  };
}

describe('AssetsCommand', () => {
  const run = (entries: AssetEntry[]) => {
    const cmd = new AssetsCommand(() => entries);
    return cmd.execute({});
  };

  it('returns a onboarding hint when no assets exist', async () => {
    const r = await run([]);
    expect(r.success).toBe(true);
    expect(r.output).toContain('尚未发现任何资产');
  });

  it('groups memories by category and counts each group', async () => {
    const entries: AssetEntry[] = [
      makeMemory('m1', 'user', 'user', '口癖'),
      makeMemory('m2', 'user', 'user', '字段'),
      makeMemory('m3', 'user', 'project', '仓库结构'),
      makeMemory('m4', 'user', 'reference', '链接'),
    ];
    const r = await run(entries);
    expect(r.success).toBe(true);
    expect(r.output).toContain('Memories (4)');
    expect(r.output).toMatch(/user\s+2/);
    expect(r.output).toMatch(/project\s+1/);
    expect(r.output).toMatch(/reference\s+1/);
  });

  it('lists skills with titles', async () => {
    const r = await run([makeSkill('s1', '周报撰写'), makeSkill('s2', '数据分析')]);
    expect(r.success).toBe(true);
    expect(r.output).toContain('Skills (2)');
    expect(r.output).toContain('周报撰写');
    expect(r.output).toContain('数据分析');
  });

  it('falls back to relative path when skill has no title metadata', async () => {
    const skill: AssetEntry = {
      id: 's1',
      type: 'skill',
      scope: 'workspace',
      absolutePath: '/tmp/x/SKILL.md',
      relativePath: 'skills/data-cleaner/SKILL.md',
      lastModified: 0,
    };
    const r = await run([skill]);
    expect(r.output).toContain('data-cleaner');
  });
});
