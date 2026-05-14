/**
 * Skill Forge 触发信号（Kevin v1.5 PRD §12.3.1）— 骨架实现。
 * 完整算法见 packages/kevin-docs/specs/kevin1.5/skill-architecture.md / PRD TODO-B。
 */

export type ForgeTriggerKind =
  | 'reuse-pattern'
  | 'structured-artifact'
  | 'explicit-phrase'
  | 'slash-save'

export interface ForgeTriggerContext {
  spaceId: string
  userText: string
  recentMissionSummary?: string
}

export class ForgeTriggerDetector {
  /** 返回应触发的信号类型，或 null。 */
  detect(ctx: ForgeTriggerContext): ForgeTriggerKind | null {
    const text = ctx.userText
    if (/\/save-as-skill\b/i.test(text)) return 'slash-save'
    if (/保存为\s*skill|save\s+as\s+skill|另存为\s*skill/i.test(text)) return 'explicit-phrase'
    if (
      /artifact|结构化|PPT|幻灯|Excel|表格|markdown\s*artifact|Artifact/i.test(text) &&
      text.length > 12
    ) {
      return 'structured-artifact'
    }
    // reuse-pattern：TODO-B — v1.5 占位：仅在有 mission 摘要且重复关键词时弱触发
    const m = ctx.recentMissionSummary?.toLowerCase() ?? ''
    if (m.length > 40 && text.toLowerCase().includes(m.slice(0, 24))) {
      return 'reuse-pattern'
    }
    return null
  }
}
