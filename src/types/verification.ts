/**
 * [I4] 4-way Verification Outcome Model (CC-Aligned).
 * Determines the flow of the agent turn after task completion.
 */
export type VerificationOutcome = 
  | 'success'           // Task completed correctly
  | 'blocking_failed'    // Critical error, must return to agent for fix
  | 'warning'           // Non-blocking issue, log but proceed
  | 'timeout';          // Verification took too long, fallback strategy needed

export interface VerificationResult {
  outcome: VerificationOutcome;
  message: string;
  remediation?: string; // Prompt hint for the agent if failed
}

export interface VerificationStep {
  name: string;
  verify: (context: any) => Promise<VerificationResult>;
  timeoutMs?: number;
}

export interface PipelineResult {
  passed: boolean;
  outcomes: Record<string, VerificationResult>;
  summary: string;
  token?: string; // HMAC completion token [I6 placeholder]
}
