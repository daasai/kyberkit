import type { Command, CommandContext, CommandResult } from '../../types/command.js';
import type { CapabilityDecomposer } from '../../learning/CapabilityDecomposer.js';
import type { DecomposeContext } from '../../learning/CapabilityDecomposer.js';
import type { DecompositionDraft } from '../../learning/ContractDraftStore.js';
import { homedir } from 'os';
import { join } from 'path';

export interface DecomposeCommandDeps {
  readonly decomposer: CapabilityDecomposer;
  readonly getContext: () => DecomposeContext;
  /** Returns available skills for the decomposer to reference. */
  readonly getSkills: () => ReadonlyArray<{ name: string; description: string }>;
  /** Absolute path to the drafts directory (shown in output). */
  readonly draftsDir: string;
}

/**
 * DecomposeCommand — /decompose <goal>
 *
 * Translates a natural-language high-level goal into a DecompositionDraft:
 * a TaskPermissionContract (draft status) + an ordered SkillChainStep list.
 *
 * The draft is saved to <userRoot>/.kyberkit/contract-drafts/<draftId>.json.
 */
export class DecomposeCommand implements Command {
  readonly name = 'decompose';
  readonly description = '将高层目标分解为合约草稿 + Skill 调用链（/decompose <goal>）';

  constructor(private readonly deps: DecomposeCommandDeps) {}

  async execute(
    args: Record<string, unknown>,
    _ctx: CommandContext,
  ): Promise<CommandResult> {
    const goal = String(args._raw ?? '').trim();

    if (!goal) {
      return {
        output:
          '用法: `/decompose <高层目标描述>`\n\n示例:\n' +
          '- `/decompose 每天凌晨 1 点生成业务日报`\n' +
          '- `/decompose 当 logs 告警时自动诊断`',
        success: false,
        continueConversation: false,
      };
    }

    let draft: DecompositionDraft;
    try {
      draft = await this.deps.decomposer.decompose(
        goal,
        this.deps.getSkills(),
        this.deps.getContext(),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        output: `分解失败：${msg}\n\n请检查网络或尝试更具体的描述。`,
        success: false,
        continueConversation: false,
      };
    }

    return {
      output: formatDraft(draft, this.deps.draftsDir),
      success: true,
      continueConversation: false,
    };
  }
}

// ─── formatter ───────────────────────────────────────────────────────────────

function formatDraft(draft: DecompositionDraft, draftsDir: string): string {
  const lines: string[] = [];
  lines.push(`✓ 目标已分解（草稿 ID: \`${draft.draftId}\`）\n`);
  lines.push(`**摘要**: ${draft.summary}\n`);

  const c = draft.contract;
  let contractDesc = `**合约类型**: ${c.contractType}`;
  if (c.contractType === 'recurring' && c.recurring?.schedule) {
    contractDesc += ` (cron: \`${c.recurring.schedule}\`)`;
  } else if (c.contractType === 'triggered' && c.triggered) {
    contractDesc += ` (触发源: \`${c.triggered.source}\`, 匹配: \`${c.triggered.match}\``;
    if (c.triggered.backoff) contractDesc += `, 节流: \`${c.triggered.backoff}\``;
    contractDesc += ')';
  }
  lines.push(`${contractDesc}\n`);

  if (draft.skillChain.length > 0) {
    lines.push('**Skill 调用链**:');
    for (const step of draft.skillChain) {
      lines.push(`${step.order}. \`${step.skillName}\` — ${step.description}`);
    }
    lines.push('');
  }

  if (c.requestedTools.length > 0) {
    const tools = c.requestedTools.map((t) => `\`${t.toolName}\` (${t.maxLevel})`).join(', ');
    lines.push(`**所需工具**: ${tools}\n`);
  }

  const shortPath = draftsDir.startsWith(homedir())
    ? '~' + draftsDir.slice(homedir().length)
    : draftsDir;
  lines.push(`草稿已保存至 \`${join(shortPath, draft.draftId + '.json')}\``);
  lines.push(`下一步: 用 \`/contract activate ${draft.draftId}\` 激活此合约（P1 调度器就绪后可用）`);

  return lines.join('\n');
}
