/**
 * Track B — semi-automatic Skill draft suggestions (Q1 = C).
 */

export interface SkillDraft {
  /** Stable id for UI / dismiss */
  readonly draftId: string;
  /** Suggested directory slug under `.kyberkit/skills/<slug>/` */
  readonly slug: string;
  /** One-line name */
  readonly title: string;
  /** Full Markdown body including YAML front matter */
  readonly markdown: string;
  readonly taskId: string;
}

export interface SkillSuggestionPayload {
  draft: SkillDraft;
  /** Tool names observed for this task (for transparency in UI) */
  readonly toolNames: readonly string[];
}
