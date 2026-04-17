import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { KyberRuntime } from './KyberRuntime.js';
import { initDefaultWorkspace } from '../cli/init.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { JsonCheckpointProvider } from '../checkpoint/JsonCheckpointProvider.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import { ExceptionHandler } from '../exception/ExceptionHandler.js';
import { VerificationPipeline } from '../validation/VerificationPipeline.js';
import { agentLoop } from '../agent/AgentLoop.js';
import type { ReliabilityLayer } from '../agent/AgentLoop.js';
import type { AgentEvent } from '../types/agent-events.js';

const runLive =
  process.env.KYBER_RUN_LIVE_TESTS === 'true' &&
  typeof process.env.ANTHROPIC_API_KEY === 'string' &&
  process.env.ANTHROPIC_API_KEY.length > 0;
const liveDescribe = runLive ? describe : describe.skip;

async function createReliability(agentId: string, rootDir: string): Promise<ReliabilityLayer> {
  const bus = new TypedEventBus<KyberEvents>();
  const memory = new MemoryStore({
    sessionFile: join(rootDir, 'memory', `${agentId}.session.json`),
    dbFile: join(rootDir, 'memory', `${agentId}.sqlite`),
    flushTrigger: { tokenThreshold: 1000, toolCallThreshold: 10, debounceMs: 50 },
    eventBus: bus,
  });
  await memory.init();

  const checkpoint = new CheckpointManager(
    new JsonCheckpointProvider(join(rootDir, 'checkpoints')),
    bus
  );
  const exceptionHandler = new ExceptionHandler(bus);
  const verification = new VerificationPipeline(bus, agentId);

  return { memory, checkpoint, exceptionHandler, verification };
}

async function runOneTurn(runtime: KyberRuntime, reliability: ReliabilityLayer, input: string): Promise<AgentEvent[]> {
  const agent = runtime.createAgent(`live-${crypto.randomUUID()}`);
  agent.transition('start');
  agent.transition('ready');
  agent.addMessage('user', input);

  const events: AgentEvent[] = [];
  for await (const event of agentLoop(runtime.createAgentLoopDeps(agent, reliability))) {
    events.push(event);
  }
  return events;
}

function collectTextDeltas(events: AgentEvent[]): string {
  return events
    .filter((event): event is Extract<AgentEvent, { type: 'text_delta' }> => event.type === 'text_delta')
    .map(event => event.text)
    .join('\n');
}

liveDescribe('Sprint2 live integration', () => {
  let sandboxDir: string;
  let originalCwd: () => string;
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), 'kyber-live-'));
    originalCwd = process.cwd;
    process.cwd = () => sandboxDir;

    savedEnv = {
      KYBER_USER_NAME: process.env.KYBER_USER_NAME,
      KYBER_WORKSPACE_ID: process.env.KYBER_WORKSPACE_ID,
      KYBER_SPACES_ROOT: process.env.KYBER_SPACES_ROOT,
      KYBER_MODEL_MAX_TOKENS: process.env.KYBER_MODEL_MAX_TOKENS,
    };

    process.env.KYBER_USER_NAME = 'default';
    process.env.KYBER_WORKSPACE_ID = 'default';
    process.env.KYBER_MODEL_MAX_TOKENS = '256';
    delete process.env.KYBER_SPACES_ROOT;

    await writeFile(join(sandboxDir, 'KK.md'), '# Project KK\n\nProject level directive.', 'utf-8');
    await initDefaultWorkspace('default');
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(sandboxDir, { recursive: true, force: true });

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('A: discovers seeded assets in default workspace', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const manifest = runtime.getActiveWorkspace().assets.getManifest();
    expect(manifest).toBeDefined();
    expect(manifest?.entries.some(e => e.type === 'kk_md')).toBe(true);
    expect(manifest?.entries.some(e => e.type === 'memory')).toBe(true);
    expect(manifest?.entries.some(e => e.type === 'skill')).toBe(true);
  });

  it('B: injects KK.md in prompt and gets live LLM response', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();

    const workspace = runtime.getActiveWorkspace();
    const assembled = await workspace.promptAssembler.assemble({
      budget: 16000,
      cwd: sandboxDir,
      tools: runtime.getTools().listAll().map(t => ({
        name: t.name,
        description: '',
        inputSchema: t.inputSchema,
      })),
      memoryContext: '## User Preferences\n- Keep answers concise and professional.',
      assets: workspace.assets.getManifest() || undefined,
      workspaceConfig: workspace.config,
      reliability: {} as unknown as ReliabilityLayer,
    });

    expect(assembled.text).toContain('# User Directives (KK.md)');
    expect(assembled.text).toContain('Project level directive');

    const response = await runtime.getModel().chat({
      model: runtime.getConfig().model.name,
      systemPrompt: assembled.text,
      maxTokens: 128,
      messages: [{ role: 'user', content: 'Reply in one short sentence and do not use emoji.' }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join(' ');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('😀');
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  });

  it('C: supports slash commands, then natural language live completion', async () => {
    const runtime = new KyberRuntime();
    await runtime.bootstrap();
    const reliability = await createReliability('agent-command', sandboxDir);

    const helpEvents = await runOneTurn(runtime, reliability, '/help');
    const helpText = collectTextDeltas(helpEvents);
    expect(helpEvents.some(e => e.type === 'turn_complete')).toBe(true);
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/memory');
    expect(helpText).toContain('/cost');
    expect(helpText).toContain('/compact');

    const memoryEvents = await runOneTurn(runtime, reliability, '/memory list');
    const memoryText = collectTextDeltas(memoryEvents);
    expect(memoryText).toContain('# Discovered Memories');
    expect(memoryText).toContain('profile.md');

    const nlEvents = await runOneTurn(
      runtime,
      reliability,
      'In one concise sentence, summarize what sprint2 adds.'
    );
    const output = collectTextDeltas(nlEvents);
    expect(output.length).toBeGreaterThan(0);
    expect(nlEvents.some(e => e.type === 'usage')).toBe(true);

    reliability.memory.close();
  });

  it('D: merges KK.md in user -> workspace -> project order', async () => {
    const userKK = join(sandboxDir, 'spaces', 'default', 'KK.md');
    const workspaceKK = join(sandboxDir, 'spaces', 'default', 'workspaces', 'default', 'KK.md');
    const projectKK = join(sandboxDir, '.kyberkit', 'KK.md');

    await writeFile(userKK, 'User Layer Rule', 'utf-8');
    await writeFile(workspaceKK, 'Workspace Layer Rule', 'utf-8');
    await rm(join(sandboxDir, '.kyberkit'), { recursive: true, force: true });
    await mkdir(join(sandboxDir, '.kyberkit'), { recursive: true });
    await writeFile(projectKK, 'Project Layer Rule', 'utf-8');

    const runtime = new KyberRuntime();
    await runtime.bootstrap();
    const merged = runtime.getActiveWorkspace().assets.getMergedKKMd() || '';

    const userPos = merged.indexOf('User Layer Rule');
    const workspacePos = merged.indexOf('Workspace Layer Rule');
    const projectPos = merged.indexOf('Project Layer Rule');

    expect(userPos).toBeGreaterThanOrEqual(0);
    expect(workspacePos).toBeGreaterThanOrEqual(0);
    expect(projectPos).toBeGreaterThanOrEqual(0);
    expect(userPos).toBeLessThan(workspacePos);
    expect(workspacePos).toBeLessThan(projectPos);
    expect((await stat(userKK)).isFile()).toBe(true);
    expect((await stat(workspaceKK)).isFile()).toBe(true);
    expect((await stat(projectKK)).isFile()).toBe(true);
  });
});
