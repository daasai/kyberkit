import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalResourceManager } from './LocalResourceManager.js';
import { ResourceExhaustedError } from './errors.js';

describe('LocalResourceManager (Red Phase)', () => {
  let manager: LocalResourceManager;

  beforeEach(() => {
    manager = new LocalResourceManager({
      maxTokens: 1000,
      maxTimeMs: 500,
      alertThresholdPercent: 0.8,
      onExceeded: 'force_kill'
    });
  });

  it('should report token consumption and throw if exceeded', () => {
    manager.reportTokenConsumption(500);
    expect(manager.tick().tokensUsed).toBe(500);

    // Should throw when exceeding 1000
    expect(() => manager.reportTokenConsumption(600)).toThrow(ResourceExhaustedError);
  });

  it('should detect time exhaustion on tick', async () => {
    // Modify the internal start time to simulate time passed if possible,
    // or wait for real time pass in tests.
    await new Promise(resolve => setTimeout(resolve, 600));
    
    expect(() => manager.tick()).toThrow(ResourceExhaustedError);
  });

  it('should alert but not throw if onExceeded is not force_kill', () => {
    const alertManager = new LocalResourceManager({
      maxTokens: 100,
      maxTimeMs: 1000,
      alertThresholdPercent: 0.5,
      onExceeded: 'alert'
    });

    alertManager.reportTokenConsumption(150);
    const status = alertManager.tick();
    expect(status.isExceeded).toBe(true);
    // Should not throw
    expect(status.tokensUsed).toBe(150);
  });
});
