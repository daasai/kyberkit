import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExceptionHandler } from './ExceptionHandler.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { ErrorCategory, ModelError } from '../types/errors.js';

describe('ExceptionHandler', () => {
  let eventBus: TypedEventBus<KyberEvents>;
  let handler: ExceptionHandler;

  beforeEach(() => {
    eventBus = new TypedEventBus<KyberEvents>();
    handler = new ExceptionHandler(eventBus, 3); // Max 3 failures
  });

  it('should route errors to registered retry strategy', async () => {
    handler.registerStrategy('model', { type: 'retry', maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    
    const error = new ModelError('Model failed');
    const action = await handler.handle(error);
    
    expect(action.strategy.type).toBe('retry');
    expect(action.applied).toBe(true);
  });

  it('should skip retry for background priority [I5]', async () => {
    handler.registerStrategy('model', { type: 'retry', maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    
    const error = new ModelError('Model failed');
    const action = await handler.handle(error, { queryPriority: 'background' });
    
    expect(action.strategy.type).toBe('abort');
    expect(action.strategy.reason).toContain('Background query');
  });

  it('should trip circuit breaker after N failures [C6]', async () => {
    handler.registerStrategy('model', { type: 'retry', maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    const error = new ModelError('Fail');

    // Record 3 failures
    handler.recordFailure('model' as ErrorCategory);
    handler.recordFailure('model' as ErrorCategory);
    handler.recordFailure('model' as ErrorCategory);

    const action = await handler.handle(error);
    expect(action.strategy.type).toBe('abort');
    expect(action.strategy.reason).toContain('Circuit breaker tripped');
  });

  it('should reset circuit breaker after success [C6]', async () => {
    handler.registerStrategy('model', { type: 'retry', maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    const error = new ModelError('Fail');

    handler.recordFailure('model' as ErrorCategory);
    handler.recordFailure('model' as ErrorCategory);
    handler.recordFailure('model' as ErrorCategory); // Tripped

    handler.recordSuccess('model' as ErrorCategory); // Reset

    const action = await handler.handle(error);
    expect(action.strategy.type).toBe('retry'); // Retry available again
  });
});
