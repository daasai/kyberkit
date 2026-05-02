import { z } from 'zod';
import type { PermissionLevel } from './PermissionPolicy.js';

export const PermissionLevelSchema = z.enum(['L0', 'L1', 'L2', 'L3']);
export const ContractTypeSchema = z.enum(['ad_hoc', 'recurring', 'triggered']);
export const ContractStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'revoked',
  'expired',
  'completed',
]);
export const PolicyPackSchema = z.enum(['development', 'balanced', 'conservative']);

export type ContractType = z.infer<typeof ContractTypeSchema>;
export type ContractStatus = z.infer<typeof ContractStatusSchema>;
export type PolicyPack = z.infer<typeof PolicyPackSchema>;

export const RequestedContextSchema = z.object({
  source: z.string().min(1),
  scope: z.string().min(1),
  mode: z.enum(['read', 'write']),
});

export const RequestedToolPermissionSchema = z.object({
  toolName: z.string().min(1),
  maxLevel: PermissionLevelSchema,
  approvalRequired: z.boolean().default(false),
});

export const ScopeDriftLimitSchema = z.object({
  dailyTokenBudget: z.number().int().positive().optional(),
  failureStreak: z.number().int().positive().optional(),
});

export const RecurringContractSchema = z.object({
  schedule: z.string().min(1),
  expiresAt: z.string().min(1).optional(),
  scopeDriftLimit: ScopeDriftLimitSchema.optional(),
});

export const TriggeredContractSchema = z.object({
  source: z.string().min(1),
  match: z.string().min(1),
  backoff: z.string().min(1).optional(),
});

export const TaskPermissionContractSchema = z
  .object({
    taskId: z.string().min(1),
    actorUserId: z.string().min(1),
    agentSessionId: z.string().min(1).optional(),
    contractType: ContractTypeSchema.default('ad_hoc'),
    status: ContractStatusSchema.default('draft'),
    policyPack: PolicyPackSchema.default('development'),
    denyListVersion: z.string().min(1).default('v1'),
    requestedTools: z.array(RequestedToolPermissionSchema).default([]),
    requestedContext: z.array(RequestedContextSchema).default([]),
    effectivePermissionRule: z
      .string()
      .default('user_permission ∩ task_permission ∩ policy_constraint'),
    recurring: RecurringContractSchema.optional(),
    triggered: TriggeredContractSchema.optional(),
    createdAt: z.number().int().nonnegative().default(() => Date.now()),
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
  })
  .superRefine((value, ctx) => {
    if (value.contractType === 'recurring' && !value.recurring) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recurring contract requires recurring configuration',
        path: ['recurring'],
      });
    }
    if (value.contractType === 'triggered' && !value.triggered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'triggered contract requires trigger configuration',
        path: ['triggered'],
      });
    }
  });

export type TaskPermissionContract = z.infer<typeof TaskPermissionContractSchema>;

export const EffectivePermissionSchema = z.enum(['allow', 'deny', 'needs_approval']);
export const ApprovalStatusSchema = z.enum(['not_required', 'required', 'approved', 'denied']);
export const PolicyDecisionCodeSchema = z.enum([
  'allow',
  'deny_list_hit',
  'contract_scope_miss',
  'policy_restricted',
  'approval_required',
  'approved',
  'approval_denied',
]);

export const PolicyDecisionSchema = z.object({
  code: PolicyDecisionCodeSchema,
  reason: z.string().min(1),
});

export const EffectivePermissionDecisionSchema = z.object({
  effectivePermission: EffectivePermissionSchema,
  approvalStatus: ApprovalStatusSchema,
  policyDecision: PolicyDecisionSchema,
  matchedRule: z.string().optional(),
});

export type EffectivePermissionDecision = z.infer<typeof EffectivePermissionDecisionSchema>;
export type PolicyDecisionCode = z.infer<typeof PolicyDecisionCodeSchema>;

const LEVEL_ORDER: Record<PermissionLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

export function isToolCallCoveredByContract(
  contract: TaskPermissionContract,
  toolName: string,
  level: PermissionLevel,
): { inScope: boolean; matched?: z.infer<typeof RequestedToolPermissionSchema> } {
  for (const requested of contract.requestedTools) {
    const nameMatched = requested.toolName === '*' || requested.toolName === toolName;
    if (!nameMatched) continue;
    if (LEVEL_ORDER[level] <= LEVEL_ORDER[requested.maxLevel]) {
      return { inScope: true, matched: requested };
    }
  }
  return { inScope: false };
}

export interface PolicyPackRule {
  readonly requireApprovalAtOrAbove: PermissionLevel;
  readonly allowPersistentGrantAtOrBelow: PermissionLevel;
}

export function getPolicyPackRule(policyPack: PolicyPack): PolicyPackRule {
  switch (policyPack) {
    case 'development':
      return { requireApprovalAtOrAbove: 'L3', allowPersistentGrantAtOrBelow: 'L2' };
    case 'balanced':
      return { requireApprovalAtOrAbove: 'L2', allowPersistentGrantAtOrBelow: 'L1' };
    case 'conservative':
      return { requireApprovalAtOrAbove: 'L1', allowPersistentGrantAtOrBelow: 'L0' };
  }
}

export function requiresApprovalByPolicy(policyPack: PolicyPack, level: PermissionLevel): boolean {
  const threshold = getPolicyPackRule(policyPack).requireApprovalAtOrAbove;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

export function parseTaskPermissionContract(input: unknown): TaskPermissionContract {
  return TaskPermissionContractSchema.parse(input);
}

export function createDefaultAdHocContract(input: {
  taskId: string;
  actorUserId: string;
  agentSessionId?: string;
  policyPack?: PolicyPack;
}): TaskPermissionContract {
  return TaskPermissionContractSchema.parse({
    ...input,
    contractType: 'ad_hoc',
    status: 'active',
    requestedTools: [{ toolName: '*', maxLevel: 'L3', approvalRequired: false }],
  });
}
