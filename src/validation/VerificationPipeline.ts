import { VerificationStep, VerificationResult, PipelineResult, VerificationOutcome } from '../types/verification.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';

/**
 * [R5] VerificationPipeline - [I4] 4-way Outcome Model.
 * Sequences verification steps to ensure task completion.
 * Borrowed from CC's verification loop pattern.
 */
export class VerificationPipeline {
  private steps: VerificationStep[] = [];

  constructor(
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly agentId: string = 'global'
  ) {}

  addStep(step: VerificationStep): void {
    this.steps.push(step);
  }

  /**
   * [I4] Executes the verification loop.
   * Logic:
   * 1. Run all steps sequentially.
   * 2. If any step is 'blocking_failed', stop and return failed.
   * 3. Collect 'warning' and 'timeout' messages for diagnostic summary.
   * 4. Return 'passed=true' if no blocking failures.
   */
  async execute(context: any): Promise<PipelineResult> {
    const outcomes: Record<string, VerificationResult> = {};
    let passed = true;
    let summaryParts: string[] = [];

    this.eventBus.emit('verification.started', { agentId: this.agentId });

    for (const step of this.steps) {
      try {
        const result = await this.runStepWithTimeout(step, context);
        outcomes[step.name] = result;

        this.eventBus.emit('verification.step_result', {
          agentId: this.agentId,
          stepName: step.name,
          outcome: result.outcome,
        });

        if (result.outcome === 'blocking_failed') {
          passed = false;
          summaryParts.push(`[FAILED] ${step.name}: ${result.message}\n${result.remediation ?? ''}`);
          break; // Stop on blocking failure
        } else if (result.outcome === 'warning' || result.outcome === 'timeout') {
          summaryParts.push(`[${result.outcome.toUpperCase()}] ${step.name}: ${result.message}`);
        }
      } catch (err: any) {
        passed = false;
        outcomes[step.name] = { outcome: 'blocking_failed', message: `Internal error: ${err.message}` };
        break;
      }
    }

    const finalResult: PipelineResult = {
      passed,
      outcomes,
      summary: summaryParts.join('\n'),
      token: passed ? `kyber_v1_${Date.now()}` : undefined // [I6 placeholder]
    };

    this.eventBus.emit('verification.completed', {
      agentId: this.agentId,
      passed,
      token: finalResult.token ?? '',
    });

    return finalResult;
  }

  private async runStepWithTimeout(step: VerificationStep, context: any): Promise<VerificationResult> {
    if (!step.timeoutMs) return step.verify(context);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ outcome: 'timeout', message: `Step "${step.name}" timed out after ${step.timeoutMs}ms` });
      }, step.timeoutMs);

      step.verify(context)
        .then(res => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(err => {
          clearTimeout(timer);
          resolve({ outcome: 'blocking_failed', message: `Exception: ${err.message}` });
        });
    });
  }
}
