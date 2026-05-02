import type {
  AgentEvent,
  ToolPermissionAudit,
  ToolProgressEvent,
  ToolResultEvent,
} from '../../types/agent-events.js';
import type { ToolIntegrationFacade, ToolUseContext } from '../../types/tool.js';
import type { PermissionSandbox } from '../../permission/PermissionSandbox.js';
import type { ToolRuleChecker } from '../../tools/ToolRuleChecker.js';
import type {
  BatchAuthPromptItem,
  CanAuthorizeBatchFn,
  CanUseToolFn,
} from '../../permission/ToolPermissionGate.js';
import {
  autoAllowCanUseTool,
  buildPermissionPrompt,
  needsInteractiveGate,
} from '../../permission/ToolPermissionGate.js';
import { classifyToolCall, type PermissionLevel } from '../../permission/PermissionPolicy.js';
import type { PermitStore } from '../../permission/PermitStore.js';
import type { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';
import {
  type EffectivePermissionDecision,
  type TaskPermissionContract,
  isToolCallCoveredByContract,
  requiresApprovalByPolicy,
} from '../../permission/TaskPermissionContract.js';

type Pending = { id: string; name: string; input: unknown };

export type ToolDispatchObservability = {
  readonly bus: TypedEventBus<KyberEvents>;
  readonly getAgentId: () => string;
};

export interface ToolDispatcherOptions {
  readonly ruleChecker?: ToolRuleChecker;
  readonly canUseTool?: CanUseToolFn;
  readonly canAuthorizeBatch?: CanAuthorizeBatchFn;
  readonly permitStore?: PermitStore;
  readonly observability?: ToolDispatchObservability;
  readonly permissionContractProvider?: () => TaskPermissionContract | undefined;
}

type ValidatedRow = { tu: Pending; ctx: ToolUseContext; err: ToolResultEvent | null };

const LEVEL_RANK: Record<PermissionLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
type PolicyEvaluation = {
  readonly level: PermissionLevel;
  readonly requiresApproval: boolean;
  readonly decision: EffectivePermissionDecision;
  readonly contract?: TaskPermissionContract;
};

/**
 * Executes tool_use blocks with progress events, optional interactive gate,
 * deny rules, parallel batches, and bash sibling-abort (CCR-style).
 */
export class ToolDispatcherMiddleware {
  private readonly ruleChecker?: ToolRuleChecker;
  private readonly canUseTool: CanUseToolFn;
  private readonly canAuthorizeBatch?: CanAuthorizeBatchFn;
  private readonly permitStore?: PermitStore;
  private readonly observability?: ToolDispatchObservability;
  private readonly permissionContractProvider?: () => TaskPermissionContract | undefined;
  private readonly policyByCallId = new Map<string, PolicyEvaluation>();

  constructor(
    private readonly tools: ToolIntegrationFacade,
    _sandbox: PermissionSandbox,
    ruleCheckerOrOptions?: ToolRuleChecker | ToolDispatcherOptions,
    canUseToolLegacy: CanUseToolFn = autoAllowCanUseTool,
    observabilityLegacy?: ToolDispatchObservability,
  ) {
    void _sandbox;
    // Back-compat: old positional signature (ruleChecker, canUseTool, observability).
    if (
      ruleCheckerOrOptions &&
      typeof ruleCheckerOrOptions === 'object' &&
      !('checkDenied' in ruleCheckerOrOptions)
    ) {
      const opts = ruleCheckerOrOptions as ToolDispatcherOptions;
      this.ruleChecker = opts.ruleChecker;
      this.canUseTool = opts.canUseTool ?? autoAllowCanUseTool;
      this.canAuthorizeBatch = opts.canAuthorizeBatch;
      this.permitStore = opts.permitStore;
      this.observability = opts.observability;
      this.permissionContractProvider = opts.permissionContractProvider;
    } else {
      this.ruleChecker = ruleCheckerOrOptions as ToolRuleChecker | undefined;
      this.canUseTool = canUseToolLegacy;
      this.observability = observabilityLegacy;
    }
  }

  async *dispatchTools(
    pendingToolUses: Pending[],
    agentContext: ToolUseContext,
  ): AsyncGenerator<AgentEvent> {
    // Sprint 3.5 §4.2 — Before gating, offer a batch authorization card for the
    // set of L1/L2 tools not yet permitted. User can grant all in one go.
    if (this.permitStore && this.canAuthorizeBatch && pendingToolUses.length > 0) {
      const items: BatchAuthPromptItem[] = [];
      for (const tu of pendingToolUses) {
        const clas = classifyToolCall(tu.name, tu.input);
        if (clas.level === 'L0') continue;
        if (clas.level === 'L3') continue; // L3 always per-call, never batch
        if (this.permitStore.check(tu.name, clas.level)) continue;
        items.push({
          toolName: tu.name,
          level: clas.level,
          label: clas.label,
          reason: clas.reason,
          inputPreview: previewInput(tu.input),
        });
      }
      if (items.length >= 1) {
        const decision = await this.canAuthorizeBatch(
          { items },
          { signal: new AbortController().signal },
        );
        this.applyBatchDecision(decision, items);
      }
    }

    let i = 0;
    while (i < pendingToolUses.length) {
      const first = pendingToolUses[i];
      const firstTool = this.tools.findTool(first.name);
      if (!firstTool) {
        yield this.unknown(first);
        i++;
        continue;
      }

      const safe =
        typeof firstTool.isConcurrencySafe === 'function' &&
        firstTool.isConcurrencySafe(first.input as any);

      if (!safe) {
        yield* this.runOneUnsafeWithProgress(first, agentContext);
        i++;
        continue;
      }

      const batch: Pending[] = [first];
      let j = i + 1;
      while (j < pendingToolUses.length) {
        const next = pendingToolUses[j];
        const def = this.tools.findTool(next.name);
        if (!def) break;
        if (typeof def.isConcurrencySafe !== 'function' || !def.isConcurrencySafe(next.input as any)) {
          break;
        }
        batch.push(next);
        j++;
      }

      const validated: ValidatedRow[] = await Promise.all(
        batch.map(async (tu) => {
          const ctx: ToolUseContext = { ...agentContext, callId: tu.id };
          const err = await this.validateAndRule(tu, ctx);
          return { tu, ctx, err };
        }),
      );

      const promptDenied = new Map<string, ToolResultEvent>();
      for (const row of validated) {
        if (row.err) continue;
        const def = this.tools.findTool(row.tu.name);
        if (!def) continue;
        if (!this.shouldGateInteractive(row.tu, def)) continue;
        yield this.progress(row.tu, 'permission', 'Awaiting confirmation');
        const decision = await this.canUseTool(this.buildEnrichedPrompt(row.tu), {
          signal: new AbortController().signal,
        });
        if (decision === 'deny') {
          this.setPolicyDecision(row.tu.id, {
            effectivePermission: 'deny',
            approvalStatus: 'denied',
            policyDecision: {
              code: 'approval_denied',
              reason: 'interactive permission denied by user',
            },
          });
          promptDenied.set(row.tu.id, {
            type: 'tool_result',
            toolUseId: row.tu.id,
            toolName: row.tu.name,
            result: 'User denied tool execution (interactive permission).',
            isError: true,
            audit: this.getAuditSnapshot(row.tu.id),
          });
        } else if (this.policyByCallId.get(row.tu.id)?.requiresApproval) {
          this.setPolicyDecision(row.tu.id, {
            effectivePermission: 'allow',
            approvalStatus: 'approved',
            policyDecision: {
              code: 'approved',
              reason: 'interactive approval granted',
            },
          });
        }
      }

      const bashReady = validated.filter(
        (r) => !r.err && !promptDenied.has(r.tu.id) && r.tu.name === 'bash',
      );
      const sibling = bashReady.length >= 2 ? new AbortController() : undefined;

      for (const row of validated) {
        if (!row.err && !promptDenied.has(row.tu.id)) {
          yield this.progress(row.tu, 'executing', 'running');
        }
      }

      const runInvoke = async (row: ValidatedRow): Promise<ToolResultEvent> => {
        if (row.err) return row.err;
        const deniedEarly = promptDenied.get(row.tu.id);
        if (deniedEarly) return deniedEarly;
        const tool = this.tools.findTool(row.tu.name);
        if (!tool) return this.unknown(row.tu);
        const ctx: ToolUseContext = {
          ...row.ctx,
          batchAbortSignal: row.tu.name === 'bash' && sibling ? sibling.signal : undefined,
        };
        const r = await this.invokeCall(row.tu, ctx, tool);
        if (row.tu.name === 'bash' && r.isError && sibling) {
          sibling.abort();
        }
        return r;
      };

      const results = await Promise.all(validated.map((row) => runInvoke(row)));
      for (const r of results) {
        yield r;
      }
      for (const row of validated) {
        this.policyByCallId.delete(row.tu.id);
      }
      i += batch.length;
    }
  }

  /**
   * Decide whether a tool call needs an interactive per-call prompt.
   * Policy-aware: L0 skips, grants (PermitStore) short-circuit, L3 always asks,
   * otherwise defer to `needsInteractiveGate` for back-compat.
   */
  private shouldGateInteractive(tu: Pending, tool: ReturnType<ToolIntegrationFacade['findTool']>): boolean {
    const clas = classifyToolCall(tu.name, tu.input);
    const policy = this.policyByCallId.get(tu.id);
    if (policy && policy.decision.effectivePermission === 'deny') return false;
    if (policy?.requiresApproval) {
      if (clas.level === 'L3') return true;
      if (this.permitStore?.check(tu.name, clas.level)) return false;
      return true;
    }
    if (clas.level === 'L0') return false;
    if (clas.level === 'L3') return true;
    if (this.permitStore?.check(tu.name, clas.level)) return false;
    // Fall back to legacy heuristic when no permit store is configured so that
    // callers that didn't opt into Sprint 3.5 behaviour are unaffected.
    if (!this.permitStore) return needsInteractiveGate(tu.name, tu.input, tool ?? undefined);
    // With a permit store configured, ungranted L1/L2 still gate per-call.
    return true;
  }

  private buildEnrichedPrompt(tu: Pending) {
    const base = buildPermissionPrompt(tu.name, tu.input);
    const clas = classifyToolCall(tu.name, tu.input);
    return { ...base, level: clas.level, requiresSecondConfirm: clas.requiresSecondConfirm };
  }

  private applyBatchDecision(
    decision: import('../../permission/ToolPermissionGate.js').BatchAuthDecision,
    items: BatchAuthPromptItem[],
  ): void {
    if (!this.permitStore) return;
    if (decision.kind === 'review_each' || decision.kind === 'deny_all') return;
    const scope: 'task' | 'session' | 'persistent' =
      decision.kind === 'allow_task'
        ? 'task'
        : decision.kind === 'allow_session'
          ? 'session'
          : 'persistent';
    const maxLevel = decision.maxLevel;
    // Grant once per distinct toolName at the chosen maxLevel.
    const seen = new Set<string>();
    for (const it of items) {
      if (LEVEL_RANK[it.level] > LEVEL_RANK[maxLevel]) continue;
      if (seen.has(it.toolName)) continue;
      seen.add(it.toolName);
      this.permitStore.addGrant({
        scope,
        toolName: it.toolName,
        maxLevel,
        reason: `批量授权(${items.length} 项)`,
      });
    }
  }

  private unknown(tu: Pending): ToolResultEvent {
    return {
      type: 'tool_result',
      toolUseId: tu.id,
      toolName: tu.name,
      result: `Unknown tool: ${tu.name}`,
      isError: true,
      audit: this.getAuditSnapshot(tu.id),
    };
  }

  private async *runOneUnsafeWithProgress(
    tu: Pending,
    agentContext: ToolUseContext,
  ): AsyncGenerator<AgentEvent> {
    yield this.progress(tu, 'executing', 'starting');
    const ctx: ToolUseContext = { ...agentContext, callId: tu.id };
    const err = await this.validateAndRule(tu, ctx);
    if (err) {
      yield this.progress(tu, 'done', 'finished');
      yield err;
      this.policyByCallId.delete(tu.id);
      return;
    }
    const tool = this.tools.findTool(tu.name);
    if (!tool) {
      yield this.progress(tu, 'done', 'finished');
      yield this.unknown(tu);
      this.policyByCallId.delete(tu.id);
      return;
    }
    if (this.shouldGateInteractive(tu, tool)) {
      yield this.progress(tu, 'permission', 'Awaiting confirmation');
      const decision = await this.canUseTool(this.buildEnrichedPrompt(tu), {
        signal: new AbortController().signal,
      });
      if (decision === 'deny') {
        this.setPolicyDecision(tu.id, {
          effectivePermission: 'deny',
          approvalStatus: 'denied',
          policyDecision: {
            code: 'approval_denied',
            reason: 'interactive permission denied by user',
          },
        });
        yield this.progress(tu, 'done', 'finished');
        yield {
          type: 'tool_result',
          toolUseId: tu.id,
          toolName: tu.name,
          result: 'User denied tool execution (interactive permission).',
          isError: true,
          audit: this.getAuditSnapshot(tu.id),
        };
        this.policyByCallId.delete(tu.id);
        return;
      }
      if (this.policyByCallId.get(tu.id)?.requiresApproval) {
        this.setPolicyDecision(tu.id, {
          effectivePermission: 'allow',
          approvalStatus: 'approved',
          policyDecision: {
            code: 'approved',
            reason: 'interactive approval granted',
          },
        });
      }
    }
    const r = await this.invokeCall(tu, ctx, tool);
    yield this.progress(tu, 'done', 'finished');
    yield r;
    this.policyByCallId.delete(tu.id);
  }

  private progress(tu: Pending, phase: ToolProgressEvent['phase'], message?: string): ToolProgressEvent {
    return {
      type: 'tool_progress',
      toolUseId: tu.id,
      toolName: tu.name,
      phase,
      message,
    };
  }

  private async validateAndRule(
    tu: Pending,
    agentContext: ToolUseContext,
  ): Promise<ToolResultEvent | null> {
    const policy = this.evaluatePolicy(tu);
    this.policyByCallId.set(tu.id, policy);
    if (policy.decision.effectivePermission === 'deny') {
      return {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: `Policy denied: ${policy.decision.policyDecision.reason}`,
        isError: true,
        audit: this.getAuditSnapshot(tu.id),
      };
    }

    const tool = this.tools.findTool(tu.name);
    if (!tool) {
      return {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: `Unknown tool: ${tu.name}`,
        isError: true,
        audit: this.getAuditSnapshot(tu.id),
      };
    }

    const deny = this.ruleChecker?.checkDenied(tu.name, tu.input);
    if (deny) {
      return {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: deny,
        isError: true,
        audit: this.getAuditSnapshot(tu.id),
      };
    }

    try {
      const permCheck = await tool.checkPermissions(tu.input, agentContext as any);
      if (permCheck.behavior === 'deny') {
        return {
          type: 'tool_result',
          toolUseId: tu.id,
          toolName: tu.name,
          result: `Permission denied for tool: ${tu.name}`,
          isError: true,
          audit: this.getAuditSnapshot(tu.id),
        };
      }

      if (tool.validateInput) {
        const valid = await tool.validateInput(tu.input, agentContext as any);
        if (!valid.result) {
          return {
            type: 'tool_result',
            toolUseId: tu.id,
            toolName: tu.name,
            result: `Validation failed: ${valid.errors?.map((e) => e.message).join('; ')}`,
            isError: true,
            audit: this.getAuditSnapshot(tu.id),
          };
        }
      }
    } catch (e: any) {
      return {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: `Error executing tool: ${e.message}`,
        isError: true,
        audit: this.getAuditSnapshot(tu.id),
      };
    }

    return null;
  }

  private async invokeCall(
    tu: Pending,
    agentContext: ToolUseContext,
    tool: NonNullable<ReturnType<ToolIntegrationFacade['findTool']>>,
  ): Promise<ToolResultEvent> {
    const obs = this.observability;
    const t0 = Date.now();
    if (obs) {
      obs.bus.emit('tool.call_start', {
        toolName: tu.name,
        agentId: obs.getAgentId(),
        input: tu.input,
        audit: this.getAuditSnapshot(tu.id),
      });
    }
    try {
      const result = await tool.call(tu.input, agentContext as any);
      const ev: ToolResultEvent = {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: (result.output as string) ?? 'Success',
        isError: !result.success,
        audit: this.getAuditSnapshot(tu.id),
      };
      if (obs) {
        obs.bus.emit('tool.call_end', {
          toolName: tu.name,
          agentId: obs.getAgentId(),
          duration: Date.now() - t0,
          success: !ev.isError,
          audit: this.getAuditSnapshot(tu.id),
        });
      }
      return ev;
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Aborted (cancelled or sibling bash error).' : e.message;
      if (obs) {
        obs.bus.emit('tool.call_end', {
          toolName: tu.name,
          agentId: obs.getAgentId(),
          duration: Date.now() - t0,
          success: false,
          audit: this.getAuditSnapshot(tu.id),
        });
      }
      return {
        type: 'tool_result',
        toolUseId: tu.id,
        toolName: tu.name,
        result: `Error executing tool: ${msg}`,
        isError: true,
        audit: this.getAuditSnapshot(tu.id),
      };
    }
  }

  private evaluatePolicy(tu: Pending): PolicyEvaluation {
    const clas = classifyToolCall(tu.name, tu.input);
    const hardDeny = this.matchImmutableDenyList(tu);
    if (hardDeny) {
      return {
        level: clas.level,
        requiresApproval: false,
        decision: {
          effectivePermission: 'deny',
          approvalStatus: 'denied',
          policyDecision: {
            code: 'deny_list_hit',
            reason: hardDeny,
          },
        },
      };
    }

    const contract = this.permissionContractProvider?.();
    if (!contract) {
      return {
        level: clas.level,
        requiresApproval: false,
        contract: undefined,
        decision: {
          effectivePermission: 'allow',
          approvalStatus: 'not_required',
          policyDecision: {
            code: 'allow',
            reason: 'no active contract (legacy fallback)',
          },
        },
      };
    }

    const inScope = isToolCallCoveredByContract(contract, tu.name, clas.level);
    if (!inScope.inScope) {
      return {
        level: clas.level,
        requiresApproval: false,
        contract,
        decision: {
          effectivePermission: 'deny',
          approvalStatus: 'denied',
          policyDecision: {
            code: 'contract_scope_miss',
            reason: `tool ${tu.name} at ${clas.level} is outside active contract`,
          },
        },
      };
    }

    const requiresApproval =
      inScope.matched?.approvalRequired === true ||
      requiresApprovalByPolicy(contract.policyPack, clas.level);
    if (requiresApproval) {
      return {
        level: clas.level,
        requiresApproval: true,
        contract,
        decision: {
          effectivePermission: 'needs_approval',
          approvalStatus: 'required',
          policyDecision: {
            code: 'approval_required',
            reason: `policy ${contract.policyPack} requires approval for ${clas.level}`,
          },
        },
      };
    }
    return {
      level: clas.level,
      requiresApproval: false,
      contract,
      decision: {
        effectivePermission: 'allow',
        approvalStatus: 'not_required',
        policyDecision: {
          code: 'allow',
          reason: 'contract and policy allow this call',
        },
      },
    };
  }

  private matchImmutableDenyList(tu: Pending): string | null {
    if (tu.name === 'bash') {
      const cmd =
        tu.input &&
        typeof tu.input === 'object' &&
        typeof (tu.input as { command?: unknown }).command === 'string'
          ? (tu.input as { command: string }).command.trim()
          : '';
      const verb = cmd.split(/\s+/)[0]?.split('/').pop()?.toLowerCase();
      if (verb === 'sudo' || verb === 'su' || verb === 'doas') {
        return `immutable deny-list: privileged shell command "${verb}"`;
      }
    }
    if (tu.name === 'delete_file') {
      const p =
        tu.input &&
        typeof tu.input === 'object' &&
        typeof (tu.input as { path?: unknown }).path === 'string'
          ? (tu.input as { path: string }).path
          : '';
      if (p.includes('.kyberkit')) {
        return 'immutable deny-list: deleting .kyberkit state is forbidden';
      }
    }
    return null;
  }

  private getAuditSnapshot(toolUseId: string): ToolPermissionAudit | undefined {
    const evalResult = this.policyByCallId.get(toolUseId);
    if (!evalResult) return undefined;
    return {
      actorUserId: evalResult.contract?.actorUserId,
      agentSessionId: evalResult.contract?.agentSessionId,
      taskId: evalResult.contract?.taskId,
      contractType: evalResult.contract?.contractType,
      policyPack: evalResult.contract?.policyPack,
      requestedPermission: evalResult.level,
      effectivePermission: evalResult.decision.effectivePermission,
      approvalStatus: evalResult.decision.approvalStatus,
      policyDecision: evalResult.decision.policyDecision,
    };
  }

  private setPolicyDecision(
    toolUseId: string,
    next: Pick<EffectivePermissionDecision, 'effectivePermission' | 'approvalStatus' | 'policyDecision'>,
  ): void {
    const prev = this.policyByCallId.get(toolUseId);
    if (!prev) return;
    this.policyByCallId.set(toolUseId, {
      ...prev,
      decision: {
        ...prev.decision,
        ...next,
      },
    });
  }
}

function previewInput(input: unknown, max = 160): string {
  try {
    const s = typeof input === 'string' ? input : JSON.stringify(input);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(input);
  }
}
