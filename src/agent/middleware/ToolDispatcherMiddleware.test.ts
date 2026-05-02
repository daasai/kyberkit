import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { ToolDispatcherMiddleware } from './ToolDispatcherMiddleware.js';
import type { AgentEvent } from '../../types/agent-events.js';
import type { ToolIntegrationFacade, ToolDefinition } from '../../types/tool.js';
import { PermissionSandbox } from '../../permission/PermissionSandbox.js';
import { TaskPermissionContractSchema } from '../../permission/TaskPermissionContract.js';

function createSandbox(): PermissionSandbox {
  return new PermissionSandbox({
    allowed: new Set(['read_fs']),
    denied: new Set(),
    allowedPaths: [],
    allowedDomains: [],
  });
}

function createTool(name: string, output = 'ok'): ToolDefinition {
  return {
    name,
    inputSchema: z.any(),
    maxResultSizeChars: 1000,
    description: async () => name,
    call: mock(async () => ({ success: true, output })),
    isConcurrencySafe: () => true,
    isReadOnly: () => false,
    isEnabled: () => true,
    checkPermissions: async () => ({ behavior: 'allow' }),
  };
}

async function collectEvents(
  dispatcher: ToolDispatcherMiddleware,
  pending: Array<{ id: string; name: string; input: unknown }>,
) {
  const out: AgentEvent[] = [];
  for await (const ev of dispatcher.dispatchTools(pending, { agentId: 'a1', traceId: 't1', callId: 'n/a' })) {
    out.push(ev);
  }
  return out;
}

describe('ToolDispatcherMiddleware policy contract integration', () => {
  it('denies calls outside active contract scope', async () => {
    const readTool = createTool('read_file');
    const writeTool = createTool('write_file');
    const facade: ToolIntegrationFacade = {
      findTool: mock((name: string) => {
        if (name === 'read_file') return readTool;
        if (name === 'write_file') return writeTool;
        return undefined;
      }),
      listAll: mock(() => [readTool, writeTool]),
    };
    const contract = TaskPermissionContractSchema.parse({
      taskId: 'task.scope',
      actorUserId: 'shawn',
      contractType: 'ad_hoc',
      status: 'active',
      policyPack: 'development',
      requestedTools: [{ toolName: 'read_file', maxLevel: 'L0' }],
    });
    const dispatcher = new ToolDispatcherMiddleware(facade, createSandbox(), {
      permissionContractProvider: () => contract,
    });
    const events = await collectEvents(dispatcher, [{ id: '1', name: 'write_file', input: { path: 'x.md', content: 'x' } }]);
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toBeTruthy();
    expect(result.isError).toBe(true);
    expect(result.audit?.policyDecision?.code).toBe('contract_scope_miss');
    expect(result.audit?.taskId).toBe('task.scope');
  });

  it('requires approval under conservative policy and preserves audit fields', async () => {
    const writeTool = createTool('write_file', 'written');
    const facade: ToolIntegrationFacade = {
      findTool: mock((name: string) => (name === 'write_file' ? writeTool : undefined)),
      listAll: mock(() => [writeTool]),
    };
    const canUseTool = mock(async () => 'allow' as const);
    const contract = TaskPermissionContractSchema.parse({
      taskId: 'task.approval',
      actorUserId: 'shawn',
      contractType: 'ad_hoc',
      status: 'active',
      policyPack: 'conservative',
      requestedTools: [{ toolName: 'write_file', maxLevel: 'L1' }],
    });
    const dispatcher = new ToolDispatcherMiddleware(facade, createSandbox(), {
      canUseTool,
      permissionContractProvider: () => contract,
    });

    const events = await collectEvents(dispatcher, [
      { id: '2', name: 'write_file', input: { path: './report.md', content: 'done' } },
    ]);
    expect(canUseTool).toHaveBeenCalled();
    expect(writeTool.call).toHaveBeenCalledTimes(1);
    const result = events.find((e) => e.type === 'tool_result');
    expect(result.isError).toBe(false);
    expect(result.audit?.approvalStatus).toBe('approved');
    expect(result.audit?.effectivePermission).toBe('allow');
    expect(result.audit?.actorUserId).toBe('shawn');
    expect(result.audit?.requestedPermission).toBe('L1');
  });

  it('hits immutable deny-list for privileged shell', async () => {
    const bashTool = createTool('bash', 'should-not-run');
    const facade: ToolIntegrationFacade = {
      findTool: mock((name: string) => (name === 'bash' ? bashTool : undefined)),
      listAll: mock(() => [bashTool]),
    };
    const contract = TaskPermissionContractSchema.parse({
      taskId: 'task.deny',
      actorUserId: 'shawn',
      contractType: 'ad_hoc',
      status: 'active',
      policyPack: 'development',
      requestedTools: [{ toolName: 'bash', maxLevel: 'L3' }],
    });
    const dispatcher = new ToolDispatcherMiddleware(facade, createSandbox(), {
      permissionContractProvider: () => contract,
    });
    const events = await collectEvents(dispatcher, [{ id: '3', name: 'bash', input: { command: 'sudo rm -rf /tmp' } }]);
    const result = events.find((e) => e.type === 'tool_result');
    expect(result.isError).toBe(true);
    expect(result.audit?.policyDecision?.code).toBe('deny_list_hit');
    expect(bashTool.call).toHaveBeenCalledTimes(0);
  });
});
