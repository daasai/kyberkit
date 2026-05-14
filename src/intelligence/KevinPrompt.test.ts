import { expect, test, describe } from 'bun:test';
import { existsSync } from 'fs';
import { readFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findKkSearchRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'KK.md')) || existsSync(join(dir, 'spaces/default/KK.md'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(__dirname, '../../');
}

const repoRoot = findKkSearchRoot();
/** Monorepo `KK.md` at root, or bundled default under `spaces/default/`. */
const kkCandidates = [join(repoRoot, 'KK.md'), join(repoRoot, 'spaces/default/KK.md')];
const kkPath = kkCandidates.find((p) => existsSync(p)) ?? kkCandidates[0];

describe('Kevin System Prompt Validation', () => {

  test('KK.md file exists', async () => {
    // bun's access() resolves to null (not undefined)
    const result = await access(kkPath);
    expect(result === undefined || result === null).toBe(true);
  });

  test('KK.md should contain Kevin identity and core principles', async () => {
    const content = await readFile(kkPath, 'utf-8');
    
    expect(content).toContain('Kevin');
    expect(content).toContain('精明');
    expect(content).toContain('高效');
    expect(content).toContain('ROI');
  });

  test('Kevin should follow professional communication rules (No Emojis)', async () => {
    const content = await readFile(kkPath, 'utf-8');
    
    expect(content).toContain('禁用表情符号');
    expect(content).toContain('标准专业术语');
  });

  test('Kevin should have domain expertise in Data Analysis and Growth', async () => {
    const content = await readFile(kkPath, 'utf-8');
    
    expect(content).toContain('数据分析');
    expect(content).toContain('业务运营增长');
    expect(content).toContain('团队管理');
  });
});
