import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { ToolDefinition, ToolResult, ToolUseContext } from '../../types/tool.js';
import { z } from 'zod';

export class DefaultSkillRegistry {
  private skills = new Map<string, ToolDefinition>();

  constructor(private readonly searchPaths: string[]) {}

  /**
   * Scan search paths for KyberKit skills.
   */
  async scan(): Promise<void> {
    for (const searchPath of this.searchPaths) {
      try {
        const entries = await fs.readdir(searchPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = path.join(searchPath, entry.name);
            const skillFile = path.join(skillDir, 'SKILL.md');
            
            try {
              // Check if SKILL.md exists
              await fs.access(skillFile);
              const skill = await this.parseSkill(skillFile, skillDir);
              if (skill) {
                this.skills.set(skill.name, skill);
              }
            } catch (err) {
              // Not a skill directory or error reading it
              continue;
            }
          }
        }
      } catch (err) {
        console.warn(`[SkillRegistry] Failed to scan path "${searchPath}":`, err);
      }
    }
  }

  /**
   * Find a skill by name.
   */
  findSkill(name: string): ToolDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * List all registered skills.
   */
  listSkills(): ToolDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Parse a SKILL.md file into a ToolDefinition.
   */
  private async parseSkill(filePath: string, dirPath: string): Promise<ToolDefinition | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Simple YAML frontmatter parser
    const match = content.match(/^---([\s\S]*?)---([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = parseYaml(match[1]);
    const instructions = match[2].trim();

    const name = frontmatter.name;
    if (!name) return null;

    return {
      name,
      description: async () => instructions,
      inputSchema: z.any(),
      maxResultSizeChars: 100_000,
      
      // Default skill behavior is just providing instructions
      async call(input: any, context: ToolUseContext): Promise<ToolResult> {
        return { 
          success: true, 
          output: `Skill "${name}" instructions provided. No execution script defined.` 
        };
      },

      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' }),
    };
  }
}
