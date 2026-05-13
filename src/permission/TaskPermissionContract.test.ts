import { describe, expect, it } from 'bun:test';
import {
  TaskPermissionContractSchema,
  isToolCallCoveredByContract,
  requiresApprovalByPolicy,
} from './TaskPermissionContract.js';

describe('TaskPermissionContractSchema', () => {
  it('accepts a valid recurring contract only when recurring config exists', () => {
    const ok = TaskPermissionContractSchema.safeParse({
      taskId: 'daily.report',
      actorUserId: 'shawn',
      contractType: 'recurring',
      recurring: { schedule: '0 1 * * *' },
      requestedTools: [{ toolName: 'read_file', maxLevel: 'L0' }],
    });
    expect(ok.success).toBe(true);

    const bad = TaskPermissionContractSchema.safeParse({
      taskId: 'daily.report',
      actorUserId: 'shawn',
      contractType: 'recurring',
      requestedTools: [{ toolName: 'read_file', maxLevel: 'L0' }],
    });
    expect(bad.success).toBe(false);
  });

  it('supports tool scope checks by name and risk level', () => {
    const contract = TaskPermissionContractSchema.parse({
      taskId: 'task-1',
      actorUserId: 'shawn',
      contractType: 'ad_hoc',
      requestedTools: [
        { toolName: 'write_file', maxLevel: 'L1' },
        { toolName: 'read_file', maxLevel: 'L0' },
      ],
    });

    expect(isToolCallCoveredByContract(contract, 'read_file', 'L0').inScope).toBe(true);
    expect(isToolCallCoveredByContract(contract, 'write_file', 'L2').inScope).toBe(false);
    expect(isToolCallCoveredByContract(contract, 'bash', 'L0').inScope).toBe(false);
  });
});

describe('requiresApprovalByPolicy', () => {
  it('applies policy pack thresholds', () => {
    expect(requiresApprovalByPolicy('development', 'L2')).toBe(false);
    expect(requiresApprovalByPolicy('development', 'L3')).toBe(true);
    expect(requiresApprovalByPolicy('balanced', 'L2')).toBe(true);
    expect(requiresApprovalByPolicy('conservative', 'L1')).toBe(true);
  });
});
