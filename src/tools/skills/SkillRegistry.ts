import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { ToolContext, ToolDefinition, ToolResult, ToolUseContext } from '../../types/tool.js';
import type { SkillMeta } from './SkillMeta.js';
import { z } from 'zod';

export class DefaultSkillRegistry {
  private skills = new Map<string, ToolDefinition>();
  private metas = new Map<string, SkillMeta>();

  constructor(private readonly searchPaths: string[]) {}

  /**
   * Scan search paths for KyberKit skills.
   */
  async scan(): Promise<void> {
    this.skills.clear();
    this.metas.clear();
    for (const searchPath of this.searchPaths) {
      try {
        const entries = await fs.readdir(searchPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = path.join(searchPath, entry.name);
            const skillFile = path.join(skillDir, 'SKILL.md');

            try {
              await fs.access(skillFile);
              const parsed = await this.parseSkill(skillFile, skillDir);
              if (parsed) {
                this.skills.set(parsed.tool.name, parsed.tool);
                this.metas.set(parsed.meta.name, parsed.meta);
              }
            } catch {
              continue;
            }
          }
        }
      } catch (err) {
        console.warn(`[SkillRegistry] Failed to scan path "${searchPath}":`, err);
      }
    }
  }

  findSkill(name: string): ToolDefinition | undefined {
    return this.skills.get(name);
  }

  listSkills(): ToolDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkillMeta(name: string): SkillMeta | undefined {
    return this.metas.get(name);
  }

  listSkillMetas(): SkillMeta[] {
    return Array.from(this.metas.values());
  }

  private async parseSkill(
    filePath: string,
    dirPath: string,
  ): Promise<{ tool: ToolDefinition; meta: SkillMeta } | null> {
    const content = await fs.readFile(filePath, 'utf-8');

    const match = content.match(/^---([\s\S]*?)---([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    const instructions = match[2].trim();

    const name = frontmatter.name as string | undefined;
    if (!name) return null;

    const descriptionShort =
      (frontmatter.description as string) ||
      instructions.split('\n').find((l) => l.trim().length > 0) ||
      `Skill ${name}`;

    const whenToUse =
      (frontmatter.when_to_use as string) ||
      (frontmatter.whenToUse as string) ||
      '';

    let activationPaths: string[] = [];
    const ap = frontmatter.activation_paths ?? frontmatter.activationPaths;
    if (Array.isArray(ap)) {
      activationPaths = ap.map(String);
    } else if (typeof ap === 'string') {
      activationPaths = [ap];
    }

    let allowedTools: string[] = [];
    const at = frontmatter.allowed_tools ?? frontmatter.allowedTools;
    if (Array.isArray(at)) {
      allowedTools = at.map(String);
    }

    const meta: SkillMeta = {
      name,
      description: descriptionShort,
      whenToUse,
      activationPaths,
      allowedTools,
      body: instructions,
      sourcePath: filePath,
    };

    const tool: ToolDefinition = {
      name,
      description: async (_input: unknown, _ctx: ToolContext) => descriptionShort,
      inputSchema: z.any(),
      maxResultSizeChars: 100_000,

      async call(_input: unknown, _context: ToolUseContext): Promise<ToolResult> {
        return {
          success: true,
          output: instructions,
        };
      },

      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' }),
    };

    return { tool, meta };
  }
}
