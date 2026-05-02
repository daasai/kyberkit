import { randomUUID } from 'crypto';
import type { ModelProvider, MessageContent } from '../types/model.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { PolicyPack } from '../permission/TaskPermissionContract.js';
import { TaskPermissionContractSchema } from '../permission/TaskPermissionContract.js';
import type { ContractDraftStore, DecompositionDraft, SkillChainStep } from './ContractDraftStore.js';

export interface SkillMeta {
  readonly name: string;
  readonly description: string;
}

export interface DecomposeContext {
  readonly actorUserId: string;
  readonly policyPack: PolicyPack;
}

export interface CapabilityDecomposerDeps {
  readonly model: ModelProvider;
  readonly compactModel: string;
  readonly fallbackModel: string;
  readonly store: ContractDraftStore;
  readonly eventBus: TypedEventBus<KyberEvents>;
}

/**
 * Raw LLM JSON response shape. All fields optional for graceful degradation.
 */
interface LlmDecompositionResponse {
  contract_type?: string;
  schedule?: string;
  trigger?: { source?: string; match?: string; backoff?: string };
  requested_tools?: Array<{ name?: string; max_level?: string }>;
  requested_context?: Array<{ source?: string; scope?: string; mode?: string }>;
  skill_chain?: Array<{ name?: string; description?: string }>;
  summary?: string;
}

/**
 * CapabilityDecomposer — 3.0 P0.5
 *
 * Uses an LLM to translate a natural-language high-level goal into a structured
 * `DecompositionDraft` containing a `TaskPermissionContract` (status=draft) and
 * an ordered `SkillChain`.
 *
 * The draft is persisted by `ContractDraftStore`; the caller (DecomposeCommand)
 * formats and returns the result to the user.
 */
export class CapabilityDecomposer {
  constructor(private readonly deps: CapabilityDecomposerDeps) {}

  async decompose(
    goal: string,
    availableSkills: readonly SkillMeta[],
    ctx: DecomposeContext,
  ): Promise<DecompositionDraft> {
    const rawJson = await this.callLlm(goal, availableSkills);
    const parsed = this.parseResponse(rawJson, goal, ctx);
    const draftPath = await this.deps.store.save(parsed);

    this.deps.eventBus.emit('capability_decomposition.completed', {
      draftId: parsed.draftId,
      goal: parsed.goal,
      contractType: parsed.contract.contractType,
      skillChainLength: parsed.skillChain.length,
      draftPath,
    });

    return parsed;
  }

  private async callLlm(goal: string, skills: readonly SkillMeta[]): Promise<string> {
    const model = this.deps.compactModel || this.deps.fallbackModel;
    const skillList =
      skills.length > 0
        ? skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
        : '(no pre-built skills available)';

    const system = `You are a capability planner for KyberKit, an AI agent framework.
Your task: decompose a natural-language goal into a structured task contract and skill chain.

Rules:
1. Determine contract_type: "recurring" if the goal involves a schedule/cron/periodic pattern,
   "triggered" if it involves reacting to events/alerts/conditions, otherwise "ad_hoc".
2. For recurring: include a "schedule" field with a cron expression.
3. For triggered: include a "trigger" object with source, match, and optional backoff.
4. List only the tools actually needed. Common tools: bash (L1), read_file (L0), write_file (L1).
5. Keep the skill_chain to 2–5 meaningful steps.
6. Respond with ONLY a JSON object. No markdown, no explanation, no backticks.

Available pre-built skills:
${skillList}`.trim();

    const user = `Decompose this goal into a contract + skill chain:
"${goal}"

Respond with JSON matching this shape:
{
  "contract_type": "recurring",
  "schedule": "0 1 * * *",
  "requested_tools": [{"name": "read_file", "max_level": "L0"}],
  "requested_context": [{"source": "business_data", "scope": "my_data", "mode": "read"}],
  "skill_chain": [{"name": "data_fetch", "description": "获取业务数据"}],
  "summary": "short summary"
}`;

    const res = await this.deps.model.chat({
      model,
      systemPrompt: system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 1024,
    });

    return extractText(res.content);
  }

  private parseResponse(
    raw: string,
    goal: string,
    ctx: DecomposeContext,
  ): DecompositionDraft {
    let parsed: LlmDecompositionResponse = {};

    try {
      // Try direct JSON parse first
      parsed = JSON.parse(extractJsonBlock(raw)) as LlmDecompositionResponse;
    } catch {
      // Fallback: empty object, graceful degradation
      parsed = {};
    }

    const contractType = normaliseContractType(parsed.contract_type);
    const draftId = randomUUID().slice(0, 8);
    const taskId = `decompose.${slugify(goal)}.${draftId}`;

    // Build RequestedToolPermission array
    const requestedTools = (parsed.requested_tools ?? [])
      .filter((t): t is typeof t & { name: string } => typeof t.name === 'string' && t.name.length > 0)
      .map((t) => ({
        toolName: t.name,
        maxLevel: normaliseLevel(t.max_level),
        approvalRequired: false as boolean,
      }));

    // Fallback: at least allow read_file
    if (requestedTools.length === 0) {
      requestedTools.push({ toolName: '*', maxLevel: 'L1' as const, approvalRequired: false });
    }

    // Build RequestedContext array
    const requestedContext = (parsed.requested_context ?? [])
      .filter((c): c is typeof c & { source: string } => typeof c.source === 'string' && c.source.length > 0)
      .map((c) => ({
        source: c.source,
        scope: c.scope ?? 'default',
        mode: (c.mode === 'write' ? 'write' : 'read') as 'read' | 'write',
      }));

    // Build contract using the existing zod schema
    const contractInput: Record<string, unknown> = {
      taskId,
      actorUserId: ctx.actorUserId,
      contractType,
      status: 'draft',
      policyPack: ctx.policyPack,
      requestedTools,
      requestedContext,
    };

    if (contractType === 'recurring' && parsed.schedule) {
      contractInput.recurring = { schedule: parsed.schedule };
    }

    if (contractType === 'triggered' && parsed.trigger?.source) {
      contractInput.triggered = {
        source: parsed.trigger.source,
        match: parsed.trigger.match ?? '*',
        backoff: parsed.trigger.backoff,
      };
    }

    const contract = TaskPermissionContractSchema.parse(contractInput);

    // Build skill chain
    const skillChain: SkillChainStep[] = (parsed.skill_chain ?? [])
      .filter((s): s is typeof s & { name: string } => typeof s.name === 'string' && s.name.length > 0)
      .map((s, i) => ({
        order: i + 1,
        skillName: s.name,
        description: s.description ?? '',
      }));

    return {
      draftId,
      goal,
      summary: parsed.summary?.trim() || goal,
      skillChain,
      contract,
      createdAt: Date.now(),
    };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractText(blocks: MessageContent[]): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

function extractJsonBlock(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Return as-is (direct JSON)
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);
  return trimmed;
}

type ContractType = 'ad_hoc' | 'recurring' | 'triggered';
function normaliseContractType(raw: string | undefined): ContractType {
  if (raw === 'recurring') return 'recurring';
  if (raw === 'triggered') return 'triggered';
  return 'ad_hoc';
}

type Level = 'L0' | 'L1' | 'L2' | 'L3';
function normaliseLevel(raw: string | undefined): Level {
  if (raw === 'L0' || raw === 'L1' || raw === 'L2' || raw === 'L3') return raw;
  return 'L1';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
