import type { AgentEvent } from '../types/agent-events.js';
import {
  KyberAnalyticsDb,
  hashUserText,
  previewUserText,
  categorizeToolError,
  newEventId,
} from './KyberAnalyticsDb.js';

const CORRECTION_RE = /^(不对|错了|应该|别用|重新|再试|should|wrong|actually)/i;

function shortHash(s: string): string {
  return hashUserText(s).slice(0, 16);
}

function estimateUsd(inputTokens: number, outputTokens: number): number {
  const inPrice = 3.0;
  const outPrice = 15.0;
  return (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
}

function redactEvent(event: AgentEvent): unknown {
  switch (event.type) {
    case 'text_delta':
      return { type: event.type, textLen: event.text.length };
    case 'thinking_delta':
      return { type: event.type, textLen: event.text.length };
    case 'tool_use_input':
      return { type: event.type, toolUseId: event.toolUseId, fragmentLen: event.fragment.length };
    case 'tool_result':
      return {
        type: event.type,
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        resultLen: event.result.length,
        isError: event.isError,
        audit: event.audit,
      };
    case 'tool_use_complete':
      return { type: event.type, toolUseId: event.toolUseId, toolName: event.toolName, inputHash: shortHash(JSON.stringify(event.input)) };
    default:
      return event;
  }
}

/**
 * Side-car recorder: writes to {@link KyberAnalyticsDb} without affecting agent decisions.
 */
export class TrajectoryRecorder {
  private readonly db: KyberAnalyticsDb;
  private readonly includeContent: boolean;
  private readonly agentId: string;
  private previousTurnId: string | null = null;
  private readonly toolStart = new Map<string, number>();
  /** tool_use_id → parsed input (captured at tool_use_complete, consumed at tool_result). */
  private readonly toolInputs = new Map<string, { name: string; input: unknown }>();
  private turnToolCount = 0;
  private turnErrorCount = 0;
  /** Sum of per-chunk usage deltas for the active natural turn (finalizeTurn persists these). */
  private turnInputTokens = 0;
  private turnOutputTokens = 0;
  private narrationTitle: string | null = null;
  private lastStopReason: string | undefined;
  /** Current task_id (from task_plan events); resets on task_complete. */
  private currentTaskId: string | null = null;

  constructor(
    dbPath: string,
    opts: { includeContent: boolean; agentId: string },
  ) {
    this.db = new KyberAnalyticsDb(dbPath);
    this.includeContent = opts.includeContent;
    this.agentId = opts.agentId;
  }

  beginNaturalTurn(turnId: string, userText: string): void {
    if (CORRECTION_RE.test(userText.trim()) && this.previousTurnId) {
      this.db.markCorrectionOnTurn(this.previousTurnId);
    }
    const preview = this.includeContent ? previewUserText(userText, 240) : null;
    this.db.insertTurn({
      id: turnId,
      agent_id: this.agentId,
      user_text_hash: hashUserText(userText),
      user_text_len: userText.length,
      user_text_preview: preview,
      started_at: Date.now(),
    });
    this.turnToolCount = 0;
    this.turnErrorCount = 0;
    this.turnInputTokens = 0;
    this.turnOutputTokens = 0;
    this.toolStart.clear();
    this.narrationTitle = null;
    this.lastStopReason = undefined;
  }

  onEvent(turnId: string | undefined, event: AgentEvent): void {
    if (!turnId) return;
    const ts = Date.now();
    const payload = this.includeContent ? event : redactEvent(event);
    this.db.appendEvent({
      id: newEventId(),
      turn_id: turnId,
      step_id: null,
      ts,
      type: event.type,
      payload_json: JSON.stringify(payload),
    });

    if (event.type === 'tool_use_start') {
      this.toolStart.set(event.toolUseId, ts);
    }

    if (event.type === 'tool_use_complete') {
      this.toolInputs.set(event.toolUseId, { name: event.toolName, input: event.input });
    }

    if (event.type === 'task_plan' && event.taskId) {
      this.currentTaskId = event.taskId;
    }

    if (event.type === 'task_complete') {
      this.currentTaskId = null;
    }

    if (event.type === 'task_narration' && !this.narrationTitle) {
      this.narrationTitle = event.text.length > 160 ? `${event.text.slice(0, 159)}…` : event.text;
    }

    if (event.type === 'tool_result') {
      const started = this.toolStart.get(event.toolUseId) ?? ts;
      const duration = Math.max(0, ts - started);
      this.turnToolCount++;
      if (event.isError) this.turnErrorCount++;
      const inputHash = shortHash(JSON.stringify({ tool: event.toolName }));
      this.db.recordToolStep({
        turn_id: turnId,
        tool_use_id: event.toolUseId,
        tool_name: event.toolName,
        input_hash: inputHash,
        started_at: started,
        ended_at: ts,
        duration_ms: duration,
        ok: !event.isError,
        error_category: categorizeToolError(event.result, event.isError),
      });

      if (!event.isError) {
        const capture = this.toolInputs.get(event.toolUseId);
        if (capture) {
          const fsEffects = detectFsEffects(capture.name, capture.input, event.result);
          for (const fx of fsEffects) {
            this.db.recordFsEvent({
              turn_id: turnId,
              task_id: this.currentTaskId,
              tool_use_id: event.toolUseId,
              tool_name: capture.name,
              path: fx.path,
              kind: fx.kind,
              size_bytes: fx.sizeBytes ?? null,
              preview: this.includeContent ? fx.preview ?? null : null,
              at_ms: ts,
            });
          }
        }
      }
      this.toolInputs.delete(event.toolUseId);
    }

    if (event.type === 'usage') {
      this.turnInputTokens += event.usage.inputTokens ?? 0;
      this.turnOutputTokens += event.usage.outputTokens ?? 0;
    }

    if (event.type === 'turn_complete') {
      this.lastStopReason = event.stopReason;
    }
  }

  /** Exposed for Sprint 3.5 TurnSummaryBuilder / /assets command. */
  getDb(): KyberAnalyticsDb {
    return this.db;
  }

  finalizeTurn(
    turnId: string,
    opts: { interrupted: boolean; stopReason?: string },
  ): void {
    const inTok = this.turnInputTokens;
    const outTok = this.turnOutputTokens;
    const usd = estimateUsd(inTok, outTok);
    this.db.finalizeTurn(turnId, {
      ended_at: Date.now(),
      stop_reason: opts.stopReason ?? this.lastStopReason ?? null,
      tool_calls: this.turnToolCount,
      errors: this.turnErrorCount,
      interrupted: opts.interrupted,
      in_tokens: inTok,
      out_tokens: outTok,
      usd_cost: usd,
      narration_title: this.narrationTitle,
    });
    this.previousTurnId = turnId;
  }

  close(): void {
    this.db.close();
  }
}

// ─── FS-effect detection (best-effort, input-driven) ─────────────────────────

interface FsEffect {
  path: string;
  kind: 'create' | 'modify' | 'delete';
  sizeBytes?: number;
  preview?: string;
}

/**
 * Rule-based detection of file system effects from successful tool invocations.
 * Only the built-in tools that clearly mutate the FS are matched; MCP tools and
 * free-form shell (`bash`) are explicitly not heuristically parsed to avoid false
 * positives — callers needing full coverage should emit FS telemetry from inside
 * the tool implementation instead.
 */
function detectFsEffects(toolName: string, input: unknown, _result: string): FsEffect[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;

  if (toolName === 'write_file') {
    const p = typeof obj.path === 'string' ? obj.path : null;
    if (!p) return [];
    const content = typeof obj.content === 'string' ? obj.content : '';
    return [
      {
        path: p,
        kind: 'create', // downstream layer may upgrade to 'modify' if file existed before
        sizeBytes: content.length,
        preview: content.length <= 240 ? content : `${content.slice(0, 239)}…`,
      },
    ];
  }

  if (toolName === 'edit_file') {
    const p = typeof obj.path === 'string' ? obj.path : null;
    if (!p) return [];
    const newStr = typeof obj.new_string === 'string' ? obj.new_string : undefined;
    return [
      {
        path: p,
        kind: 'modify',
        sizeBytes: newStr ? newStr.length : undefined,
        preview: newStr ? (newStr.length <= 240 ? newStr : `${newStr.slice(0, 239)}…`) : undefined,
      },
    ];
  }

  if (toolName === 'delete_file') {
    const p = typeof obj.path === 'string' ? obj.path : null;
    if (!p) return [];
    return [{ path: p, kind: 'delete' }];
  }

  return [];
}
