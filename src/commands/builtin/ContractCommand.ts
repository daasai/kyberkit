/**
 * ContractCommand — 3.0 P1
 *
 * /contract list|activate|pause|revoke
 *
 * Bridges the user to ContractRegistry + ContractDraftStore for managing
 * the lifecycle of recurring and triggered contracts.
 */

import type { Command, CommandContext, CommandResult } from '../../types/command.js';
import type { ContractRegistry } from '../../scheduler/ContractRegistry.js';
import type { ContractDraftStore } from '../../learning/ContractDraftStore.js';
import { TaskPermissionContractSchema } from '../../permission/TaskPermissionContract.js';
import type { TaskPermissionContract } from '../../permission/TaskPermissionContract.js';

export interface ContractCommandDeps {
  readonly registry: ContractRegistry;
  readonly draftStore: ContractDraftStore;
}

export class ContractCommand implements Command {
  readonly name = 'contract';
  readonly description = '管理合约生命周期（/contract list|activate|pause|revoke）';

  constructor(private readonly deps: ContractCommandDeps) {}

  async execute(
    args: Record<string, unknown>,
    _ctx: CommandContext,
  ): Promise<CommandResult> {
    const raw = String(args._raw ?? '').trim();
    const [subcommand, ...rest] = raw.split(/\s+/);
    const id = rest.join(' ').trim();

    switch (subcommand) {
      case 'list':
      case '':
      case undefined:
        return this.listContracts();

      case 'activate':
        if (!id) return usageError('activate <draftId>');
        return this.activateContract(id);

      case 'pause':
        if (!id) return usageError('pause <contractId>');
        return this.pauseContract(id);

      case 'revoke':
        if (!id) return usageError('revoke <contractId>');
        return this.revokeContract(id);

      default:
        return {
          output: `未知子命令: \`${subcommand}\`\n用法: /contract list | activate <draftId> | pause <id> | revoke <id>`,
          success: false,
          continueConversation: false,
        };
    }
  }

  // ─── subcommand handlers ───────────────────────────────────────────────────

  private listContracts(): CommandResult {
    const all = this.deps.registry.list();
    if (all.length === 0) {
      return {
        output: '当前没有任何合约。\n\n用 `/decompose <目标>` 创建草稿，再用 `/contract activate <draftId>` 激活。',
        success: true,
        continueConversation: false,
      };
    }

    const byStatus = groupBy(all, (c) => c.status);
    const lines: string[] = ['## 合约列表\n'];

    const order: Array<TaskPermissionContract['status']> = [
      'active', 'paused', 'draft', 'revoked', 'expired', 'completed',
    ];

    for (const status of order) {
      const group = byStatus[status];
      if (!group || group.length === 0) continue;
      lines.push(`### ${statusLabel(status)} (${group.length})\n`);
      for (const c of group) {
        const type = c.contractType;
        let extra = '';
        if (type === 'recurring' && c.recurring?.schedule) {
          extra = ` — cron: \`${c.recurring.schedule}\``;
        } else if (type === 'triggered' && c.triggered) {
          extra = ` — 触发: \`${c.triggered.source}\` / \`${c.triggered.match}\``;
        }
        lines.push(`- \`${c.taskId}\` [${type}]${extra}`);
      }
      lines.push('');
    }

    return { output: lines.join('\n'), success: true, continueConversation: false };
  }

  private async activateContract(draftId: string): Promise<CommandResult> {
    // Accept either a draftId (from ContractDraftStore) or a direct contractId in registry
    let contract = this.deps.registry.get(draftId);

    if (!contract) {
      const draft = await this.deps.draftStore.load(draftId);
      if (!draft) {
        return {
          output: `找不到草稿或合约: \`${draftId}\`\n\n请用 \`/decompose\` 先生成草稿。`,
          success: false,
          continueConversation: false,
        };
      }
      // Parse the embedded contract from the draft
      const parsed = TaskPermissionContractSchema.safeParse(draft.contract);
      if (!parsed.success) {
        return {
          output: `草稿合约 schema 无效: ${parsed.error.message}`,
          success: false,
          continueConversation: false,
        };
      }
      contract = parsed.data;
    }

    if (contract.status === 'revoked') {
      return {
        output: `合约 \`${draftId}\` 已撤销，无法重新激活。`,
        success: false,
        continueConversation: false,
      };
    }

    this.deps.registry.activate(contract);

    const typeHint =
      contract.contractType === 'recurring'
        ? `将按 cron \`${contract.recurring?.schedule ?? '—'}\` 自动运行。`
        : contract.contractType === 'triggered'
          ? `将监听 \`${contract.triggered?.source ?? '—'}\` 事件触发。`
          : '将在下次调用时执行。';

    return {
      output: `✓ 合约 \`${contract.taskId}\` 已激活 [${contract.contractType}]\n\n${typeHint}`,
      success: true,
      continueConversation: false,
    };
  }

  private pauseContract(contractId: string): CommandResult {
    const contract = this.deps.registry.get(contractId);
    if (!contract) {
      return {
        output: `找不到合约: \`${contractId}\``,
        success: false,
        continueConversation: false,
      };
    }
    if (contract.status !== 'active') {
      return {
        output: `合约 \`${contractId}\` 当前状态为 \`${contract.status}\`，无法暂停。`,
        success: false,
        continueConversation: false,
      };
    }
    this.deps.registry.pause(contractId, '用户手动暂停');
    return {
      output: `⏸ 合约 \`${contractId}\` 已暂停。用 \`/contract activate ${contractId}\` 恢复。`,
      success: true,
      continueConversation: false,
    };
  }

  private revokeContract(contractId: string): CommandResult {
    const contract = this.deps.registry.get(contractId);
    if (!contract) {
      return {
        output: `找不到合约: \`${contractId}\``,
        success: false,
        continueConversation: false,
      };
    }
    this.deps.registry.revoke(contractId);
    return {
      output: `✗ 合约 \`${contractId}\` 已撤销（不可恢复）。`,
      success: true,
      continueConversation: false,
    };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function usageError(usage: string): CommandResult {
  return {
    output: `用法: \`/contract ${usage}\``,
    success: false,
    continueConversation: false,
  };
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '🟢 运行中',
    paused: '⏸ 已暂停',
    draft: '📝 草稿',
    revoked: '❌ 已撤销',
    expired: '⏰ 已到期',
    completed: '✅ 已完成',
  };
  return labels[status] ?? status;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
