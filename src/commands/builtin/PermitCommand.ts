import type { Command, CommandResult } from '../../types/command.js';
import type { PermissionLevel } from '../../permission/PermissionPolicy.js';
import type { PermitStore, PermitScope } from '../../permission/PermitStore.js';

/**
 * `/permit` — Sprint 3.5 §4.3 audit + control surface.
 *
 *   /permit             — alias for `list`
 *   /permit list        — show all grants grouped by scope
 *   /permit review      — same as list (mirrors the memo wording)
 *   /permit clear task      — revoke task-scope grants
 *   /permit clear session   — revoke session-scope grants
 *   /permit clear persistent — revoke persistent grants (in-memory only)
 *   /permit clear all   — revoke everything across scopes
 *   /permit add persistent <tool> <L0|L1|L2|L3> — add a durable grant (saved to permit.yaml)
 *   /permit revoke <tool> — remove a persistent grant for that tool
 */
export class PermitCommand implements Command {
  readonly name = 'permit';
  readonly description = 'List or clear task/session/persistent tool permission grants';
  readonly subcommands = ['list', 'review', 'clear', 'add', 'revoke'];

  constructor(private readonly getStore: () => PermitStore | undefined) {}

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const store = this.getStore();
    if (!store) {
      return {
        output: 'PermitStore is unavailable in this session.',
        success: false,
        continueConversation: false,
      };
    }

    const raw = ((args._raw as string) || '').trim();

    if (raw === '' || raw === 'list' || raw === 'review') {
      return this.list(store);
    }

    if (raw.startsWith('clear')) {
      const scope = raw.slice('clear'.length).trim();
      return this.clear(store, scope);
    }

    if (raw.startsWith('add')) {
      return this.addPersistent(store, raw.slice('add'.length).trim());
    }

    if (raw.startsWith('revoke')) {
      return this.revokePersistent(store, raw.slice('revoke'.length).trim());
    }

    return this.usage();
  }

  private addPersistent(store: PermitStore, rest: string): CommandResult {
    const parts = rest.trim().split(/\s+/);
    if (parts[0]?.toLowerCase() !== 'persistent' || parts.length < 3) {
      return {
        output: 'Usage: /permit add persistent <toolName> <L0|L1|L2|L3>',
        success: false,
        continueConversation: false,
      };
    }
    const toolName = parts[1] ?? '';
    const level = parts[2]?.toUpperCase() as PermissionLevel;
    if (!isLevel(level)) {
      return { output: `Invalid level: ${parts[2]}`, success: false, continueConversation: false };
    }
    store.addGrant({ scope: 'persistent', toolName, maxLevel: level, reason: 'manual /permit add' });
    return {
      output: `已添加持久授权: [${level}] ${toolName}（已写入 permit.yaml）`,
      success: true,
      continueConversation: false,
    };
  }

  private revokePersistent(store: PermitStore, rest: string): CommandResult {
    const tool = rest.trim();
    if (!tool) {
      return { output: 'Usage: /permit revoke <toolName>', success: false, continueConversation: false };
    }
    const ok = store.revokePersistent(tool);
    return {
      output: ok ? `已撤销持久授权: ${tool}` : `未找到持久授权: ${tool}`,
      success: ok,
      continueConversation: false,
    };
  }

  private list(store: PermitStore): CommandResult {
    const snap = store.snapshot();
    const out: string[] = [];
    out.push(`# 授权清单 · 模式: ${store.modeLabel()}`);
    out.push('');
    const renderScope = (label: string, grants: typeof snap.taskGrants): void => {
      out.push(`## ${label} (${grants.length})`);
      if (grants.length === 0) {
        out.push('- (空)');
        return;
      }
      for (const g of grants) {
        const ts = new Date(g.grantedAt).toLocaleTimeString();
        const who = g.toolName === '*' ? '所有工具' : g.toolName;
        out.push(
          `- [${g.maxLevel}] ${who} · ${ts}${g.reason ? ` · ${g.reason}` : ''}${g.taskId ? ` · task=${g.taskId.slice(0, 8)}` : ''}`,
        );
      }
    };
    renderScope('任务级', snap.taskGrants);
    out.push('');
    renderScope('会话级', snap.sessionGrants);
    out.push('');
    renderScope('持久级', snap.persistentGrants);
    return { output: out.join('\n'), success: true, continueConversation: false };
  }

  private clear(store: PermitStore, scopeArg: string): CommandResult {
    const scope = scopeArg.toLowerCase();
    if (scope === 'all' || scope === '') {
      const a = store.clearScope('task');
      const b = store.clearScope('session');
      const c = store.clearScope('persistent');
      return {
        output: `已撤销授权：任务 ${a} · 会话 ${b} · 持久 ${c}。`,
        success: true,
        continueConversation: false,
      };
    }
    if (scope === 'task' || scope === 'session' || scope === 'persistent') {
      const n = store.clearScope(scope as PermitScope);
      return {
        output: `已撤销 ${scope} 级授权 ${n} 条。`,
        success: true,
        continueConversation: false,
      };
    }
    return {
      output: `未知作用域 "${scopeArg}"。用 task/session/persistent/all。`,
      success: false,
      continueConversation: false,
    };
  }

  private usage(): CommandResult {
    return {
      output:
        'Usage: /permit [list|review|clear <task|session|persistent|all>|add persistent <tool> <L#>|revoke <tool>]',
      success: false,
      continueConversation: false,
    };
  }
}

function isLevel(s: string): s is PermissionLevel {
  return s === 'L0' || s === 'L1' || s === 'L2' || s === 'L3';
}
