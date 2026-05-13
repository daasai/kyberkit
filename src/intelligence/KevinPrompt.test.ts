import { expect, test, describe } from 'bun:test';
import { readFile, access } from 'fs/promises';
import { join } from 'path';

describe('Kevin System Prompt Validation', () => {
  const kkPath = join(process.cwd(), 'KK.md');

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
