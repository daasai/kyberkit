import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DefaultSkillRegistry } from './SkillRegistry.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SkillRegistry (M4.L2)', () => {
  let tmpDir: string;
  let registry: DefaultSkillRegistry;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyber-skills-'));
    registry = new DefaultSkillRegistry([tmpDir]);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should find and parse a valid skill directory', async () => {
    // Create a dummy skill
    const skillPath = path.join(tmpDir, 'test-skill');
    await fs.mkdir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---
name: test_skill
description: A test skill
---
# Instructions
Do something cool.`);

    await registry.scan();
    const skills = registry.listSkills();
    
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('test_skill');
  });

  it('should ignore directories without SKILL.md', async () => {
    await fs.mkdir(path.join(tmpDir, 'not-a-skill'));
    await registry.scan();
    expect(registry.listSkills().length).toBe(0);
  });

  it('should provide instructions for a skill', async () => {
    const skillPath = path.join(tmpDir, 'info-skill');
    await fs.mkdir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---\nname: info\n---\nRead me.`);

    await registry.scan();
    const skill = registry.findSkill('info')!;
    
    // In our implementation, a Skill is also a ToolDefinition
    const description = await skill.description({}, { agentId: 'a', traceId: 't' });
    expect(description).toContain('Read me.');
  });
});
