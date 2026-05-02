import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { randomUUID } from 'crypto';

import { ContractDraftStore } from './ContractDraftStore.js';
import { CapabilityDecomposer } from './CapabilityDecomposer.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { TaskPermissionContract } from '../permission/TaskPermissionContract.js';
import { TaskPermissionContractSchema } from '../permission/TaskPermissionContract.js';

// ─── ContractDraftStore ───────────────────────────────────────────────────────

function makeContract(overrides?: Partial<TaskPermissionContract>): TaskPermissionContract {
  return TaskPermissionContractSchema.parse({
    taskId: `test-task-${randomUUID().slice(0, 6)}`,
    actorUserId: 'test-user',
    contractType: 'ad_hoc',
    status: 'draft',
    policyPack: 'development',
    requestedTools: [{ toolName: 'read_file', maxLevel: 'L0' }],
    ...overrides,
  });
}

describe('ContractDraftStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `kyber-draft-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  it('saves and loads a draft', async () => {
    const store = new ContractDraftStore(tmpDir);
    const draft = {
      draftId: 'abc12345',
      goal: '每天生成日报',
      summary: '自动日报',
      skillChain: [{ order: 1, skillName: 'report', description: '生成日报' }],
      contract: makeContract(),
      createdAt: Date.now(),
    };

    const path = await store.save(draft);
    expect(path).toContain('abc12345.json');

    const loaded = await store.load('abc12345');
    expect(loaded).not.toBeNull();
    expect(loaded?.goal).toBe('每天生成日报');
    expect(loaded?.skillChain[0].skillName).toBe('report');
  });

  it('returns null when loading non-existent draft', async () => {
    const store = new ContractDraftStore(tmpDir);
    expect(await store.load('nonexistent')).toBeNull();
  });

  it('listAll returns all drafts sorted by createdAt desc', async () => {
    const store = new ContractDraftStore(tmpDir);
    const t = Date.now();
    await store.save({
      draftId: 'draft-1',
      goal: 'first',
      summary: '',
      skillChain: [],
      contract: makeContract(),
      createdAt: t - 1000,
    });
    await store.save({
      draftId: 'draft-2',
      goal: 'second',
      summary: '',
      skillChain: [],
      contract: makeContract(),
      createdAt: t,
    });

    const all = await store.listAll();
    expect(all).toHaveLength(2);
    expect(all[0].draftId).toBe('draft-2'); // newest first
    expect(all[1].draftId).toBe('draft-1');
  });

  it('auto-creates the directory if it does not exist', async () => {
    const store = new ContractDraftStore(join(tmpDir, 'nested', 'dir'));
    const path = await store.save({
      draftId: 'autodir-test',
      goal: 'test',
      summary: '',
      skillChain: [],
      contract: makeContract(),
      createdAt: Date.now(),
    });
    expect(path).toContain('autodir-test.json');
  });
});

// ─── CapabilityDecomposer ─────────────────────────────────────────────────────

function makeMockModel(responseJson: object) {
  return {
    chat: mock(async () => ({
      content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 50 },
    })),
  };
}

describe('CapabilityDecomposer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `kyber-decomp-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  it('decomposes a recurring goal into a draft with cron schedule', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const completed = mock();
    bus.on('capability_decomposition.completed', completed);

    const model = makeMockModel({
      contract_type: 'recurring',
      schedule: '0 1 * * *',
      requested_tools: [{ name: 'read_file', max_level: 'L0' }, { name: 'bash', max_level: 'L1' }],
      requested_context: [{ source: 'business_data', scope: 'my_data', mode: 'read' }],
      skill_chain: [
        { name: 'data_fetch', description: '获取业务数据' },
        { name: 'report_gen', description: '生成日报' },
      ],
      summary: '每天凌晨 1 点生成日报',
    });

    const store = new ContractDraftStore(tmpDir);
    const decomposer = new CapabilityDecomposer({
      model: model as any,
      compactModel: 'compact',
      fallbackModel: 'fallback',
      store,
      eventBus: bus,
    });

    const draft = await decomposer.decompose(
      '每天凌晨 1 点生成业务日报',
      [],
      { actorUserId: 'shawn', policyPack: 'development' },
    );

    expect(draft.contract.contractType).toBe('recurring');
    expect(draft.contract.recurring?.schedule).toBe('0 1 * * *');
    expect(draft.skillChain).toHaveLength(2);
    expect(draft.skillChain[0].skillName).toBe('data_fetch');
    expect(draft.skillChain[1].skillName).toBe('report_gen');
    expect(draft.summary).toBe('每天凌晨 1 点生成日报');
    expect(draft.contract.status).toBe('draft');

    expect(completed).toHaveBeenCalledTimes(1);
    const ev = (completed.mock.calls[0] as any)[0];
    expect(ev.contractType).toBe('recurring');
    expect(ev.skillChainLength).toBe(2);
  });

  it('decomposes a triggered goal into a draft with trigger config', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const model = makeMockModel({
      contract_type: 'triggered',
      trigger: { source: 'logs.alert', match: 'payment-fail-spike', backoff: '5m' },
      requested_tools: [{ name: 'bash', max_level: 'L1' }],
      skill_chain: [{ name: 'auto_diagnose', description: '自动诊断告警' }],
      summary: '当 logs 出现告警时自动诊断',
    });

    const store = new ContractDraftStore(tmpDir);
    const decomposer = new CapabilityDecomposer({
      model: model as any,
      compactModel: 'compact',
      fallbackModel: 'fallback',
      store,
      eventBus: bus,
    });

    const draft = await decomposer.decompose(
      '当 logs 出现 payment-fail-spike 时自动诊断',
      [],
      { actorUserId: 'shawn', policyPack: 'development' },
    );

    expect(draft.contract.contractType).toBe('triggered');
    expect(draft.contract.triggered?.source).toBe('logs.alert');
    expect(draft.contract.triggered?.match).toBe('payment-fail-spike');
    expect(draft.contract.triggered?.backoff).toBe('5m');
    expect(draft.skillChain[0].skillName).toBe('auto_diagnose');
  });

  it('gracefully handles invalid JSON from LLM', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const model = {
      chat: mock(async () => ({
        content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      })),
    };

    const store = new ContractDraftStore(tmpDir);
    const decomposer = new CapabilityDecomposer({
      model: model as any,
      compactModel: 'compact',
      fallbackModel: 'fallback',
      store,
      eventBus: bus,
    });

    // Should not throw — falls back gracefully
    const draft = await decomposer.decompose(
      '帮我做某件事',
      [],
      { actorUserId: 'shawn', policyPack: 'development' },
    );
    expect(draft.contract.contractType).toBe('ad_hoc'); // default fallback
    expect(draft.contract.status).toBe('draft');
    expect(draft.skillChain).toHaveLength(0);
  });

  it('extracts JSON from markdown code fence if present', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const model = {
      chat: mock(async () => ({
        content: [{ type: 'text', text: '```json\n{"contract_type":"ad_hoc","skill_chain":[],"summary":"test"}\n```' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 20 },
      })),
    };

    const store = new ContractDraftStore(tmpDir);
    const decomposer = new CapabilityDecomposer({
      model: model as any,
      compactModel: 'compact',
      fallbackModel: 'fallback',
      store,
      eventBus: bus,
    });

    const draft = await decomposer.decompose('test goal', [], {
      actorUserId: 'shawn',
      policyPack: 'development',
    });
    expect(draft.summary).toBe('test');
  });

  it('includes available skills in the LLM prompt', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const chatMock = mock(async () => ({
      content: [{ type: 'text', text: '{"contract_type":"ad_hoc","skill_chain":[],"summary":"ok"}' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 5, outputTokens: 10 },
    }));
    const model = { chat: chatMock };

    const store = new ContractDraftStore(tmpDir);
    const decomposer = new CapabilityDecomposer({
      model: model as any,
      compactModel: 'compact',
      fallbackModel: 'fallback',
      store,
      eventBus: bus,
    });

    await decomposer.decompose(
      'some goal',
      [{ name: 'my_skill', description: '我的技能' }],
      { actorUserId: 'shawn', policyPack: 'development' },
    );

    const callArgs = (chatMock.mock.calls[0] as any)[0];
    expect(callArgs.systemPrompt).toContain('my_skill');
    expect(callArgs.systemPrompt).toContain('我的技能');
  });
});
