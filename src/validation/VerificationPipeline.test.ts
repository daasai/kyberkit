import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationPipeline } from './VerificationPipeline.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { VerificationStep, VerificationResult } from '../types/verification.js';

describe('VerificationPipeline', () => {
  let eventBus: TypedEventBus<KyberEvents>;
  let pipeline: VerificationPipeline;

  beforeEach(() => {
    eventBus = new TypedEventBus<KyberEvents>();
    pipeline = new VerificationPipeline(eventBus);
  });

  it('should pass if all steps are success', async () => {
    const step: VerificationStep = {
      name: 'Check Lint',
      verify: async () => ({ outcome: 'success', message: 'Lint passed' })
    };
    pipeline.addStep(step);

    const result = await pipeline.execute({});
    expect(result.passed).toBe(true);
    expect(result.outcomes['Check Lint'].outcome).toBe('success');
  });

  it('should fail if any step is blocking_failed [I4]', async () => {
    const step1: VerificationStep = {
      name: 'Lint',
      verify: async () => ({ outcome: 'success', message: 'OK' })
    };
    const step2: VerificationStep = {
      name: 'Tests',
      verify: async () => ({ 
        outcome: 'blocking_failed', 
        message: 'Tests failed', 
        remediation: 'Fix the broken test' 
      })
    };
    pipeline.addStep(step1);
    pipeline.addStep(step2);

    const result = await pipeline.execute({});
    expect(result.passed).toBe(false);
    expect(result.outcomes['Tests'].outcome).toBe('blocking_failed');
    expect(result.summary).toContain('Fix the broken test');
  });

  it('should continue if step is warning [I4]', async () => {
    const step: VerificationStep = {
      name: 'Unused Variable',
      verify: async () => ({ outcome: 'warning', message: 'Consider removal' })
    };
    pipeline.addStep(step);

    const result = await pipeline.execute({});
    expect(result.passed).toBe(true); // Warning is non-blocking
    expect(result.summary).toContain('Consider removal');
  });

  it('should emit verification events', async () => {
    const spy = vi.fn();
    eventBus.on('verification.completed', spy);

    pipeline.addStep({ name: 'S1', verify: async () => ({ outcome: 'success', message: 'ok' }) });
    await pipeline.execute({});

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
  });
});
