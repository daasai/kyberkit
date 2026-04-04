import { ErrorCategory, KyberError } from '../types/errors.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';

export type QueryPriority = 'foreground' | 'background';

export type RecoveryStrategy =
  | { type: 'retry'; maxAttempts: number; backoffMs: number; backoffMultiplier: number; jitterFactor?: number }
  | { type: 'fallback'; fallbackFn: () => Promise<unknown> }
  | { type: 'checkpoint_restore'; checkpointId?: string }
  | { type: 'escalate_to_human'; message: string }
  | { type: 'abort'; reason: string };

export interface RecoveryAction {
  strategy: RecoveryStrategy;
  applied: boolean;
  result?: unknown;
  error?: Error;
  attemptCount: number;
}

export interface CircuitBreakerState {
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  isTripped: boolean;
  trippedAt?: number;
}

/**
 * [R4] ExceptionHandler - Advanced error routing and recovery.
 * [C6]: Circuit Breaker to prevent API cascade failures.
 * [I5]: Query priority to skip non-critical background retries.
 */
export class ExceptionHandler {
  private strategies = new Map<ErrorCategory, RecoveryStrategy>();
  private circuitBreakers = new Map<ErrorCategory, CircuitBreakerState>();

  constructor(
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly defaultMaxConsecutiveFailures = 3,
  ) {}

  registerStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void {
    this.strategies.set(category, strategy);
    if (strategy.type === 'retry') {
      this.circuitBreakers.set(category, {
        consecutiveFailures: 0,
        maxConsecutiveFailures: this.defaultMaxConsecutiveFailures,
        isTripped: false,
      });
    }
  }

  /**
   * Routes an error to the appropriate recovery strategy.
   * [C6] Checks circuit breaker before attempting retry.
   * [I5] Background queries bypass retry by design.
   */
  async handle(
    error: KyberError,
    context?: { checkpointManager?: CheckpointManager; queryPriority?: QueryPriority },
  ): Promise<RecoveryAction> {
    const strategy = this.strategies.get(error.category)
      ?? { type: 'abort' as const, reason: `No strategy for category "${error.category}"` };

    // [I5] Background queries skip retry to avoid cascade amplification
    if (context?.queryPriority === 'background' && strategy.type === 'retry') {
      this.eventBus.emit('exception.background_dropped', { error, category: error.category });
      return { 
        strategy: { type: 'abort', reason: 'Background query — retry skipped' }, 
        applied: true, 
        attemptCount: 0 
      };
    }

    // [C6] Circuit breaker check
    if (strategy.type === 'retry') {
      const breaker = this.circuitBreakers.get(error.category);
      if (breaker?.isTripped) {
        this.eventBus.emit('exception.circuit_breaker_open', { category: error.category });
        return { 
          strategy: { type: 'abort', reason: 'Circuit breaker tripped for category' }, 
          applied: true, 
          attemptCount: 0 
        };
      }
    }

    this.eventBus.emit('exception.handling', { error, strategy: strategy.type });

    switch (strategy.type) {
      case 'retry':
        return { strategy, applied: true, attemptCount: 0 }; // Logic executed by AgentLoop
      case 'fallback':
        return { strategy, applied: true, attemptCount: 0 }; // Logic placeholder
      default:
        return { strategy, applied: true, attemptCount: 0 };
    }
  }

  /** [C6] Success resets circuit breaker. */
  recordSuccess(category: ErrorCategory): void {
    const breaker = this.circuitBreakers.get(category);
    if (breaker) {
      breaker.consecutiveFailures = 0;
      breaker.isTripped = false;
    }
  }

  /** [C6] Failure increments breaker count, may trip. */
  recordFailure(category: ErrorCategory): void {
    const breaker = this.circuitBreakers.get(category);
    if (!breaker) return;
    
    breaker.consecutiveFailures++;
    if (breaker.consecutiveFailures >= breaker.maxConsecutiveFailures) {
      breaker.isTripped = true;
      breaker.trippedAt = Date.now();
      this.eventBus.emit('exception.circuit_breaker_tripped', {
        category, consecutiveFailures: breaker.consecutiveFailures,
      });
    }
  }
}
