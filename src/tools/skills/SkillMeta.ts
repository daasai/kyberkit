/**
 * Parsed metadata from a SKILL.md frontmatter (for discovery, not API tools).
 */
export interface SkillMeta {
  readonly name: string;
  readonly description: string;
  readonly whenToUse: string;
  readonly activationPaths: string[];
  readonly allowedTools: string[];
  readonly body: string;
  readonly sourcePath: string;
}
