import { ResourceManager, BudgetConfig, BudgetStatus } from '../types/scale.js';
import { ResourceExhaustedError } from './errors.js';

export class LocalResourceManager implements ResourceManager {
  private config!: BudgetConfig;
  private status!: BudgetStatus;
  private startTime: number = 0;

  constructor(config: BudgetConfig) {
    this.configure(config);
    this.reset();
  }

  configure(config: BudgetConfig): void {
    this.config = config;
  }

  reportTokenConsumption(tokens: number): void {
    this.status.tokensUsed += tokens;
    this.validate('tokens');
  }

  tick(): BudgetStatus {
    this.status.timeElapsedMs = Date.now() - this.startTime;
    this.validate('time');
    return { ...this.status };
  }

  reset(): void {
    this.status = {
      tokensUsed: 0,
      timeElapsedMs: 0,
      isAlerting: false,
      isExceeded: false
    };
    this.startTime = Date.now();
  }

  private validate(trigger: 'tokens' | 'time'): void {
    const isTokensExceeded = this.status.tokensUsed > this.config.maxTokens;
    const isTimeExceeded = (Date.now() - this.startTime) > this.config.maxTimeMs;

    if (isTokensExceeded || isTimeExceeded) {
      this.status.isExceeded = true;
      if (this.config.onExceeded === 'force_kill') {
        throw new ResourceExhaustedError(
          isTokensExceeded ? 'tokens' : 'time',
          isTokensExceeded ? this.status.tokensUsed : (Date.now() - this.startTime),
          isTokensExceeded ? this.config.maxTokens : this.config.maxTimeMs
        );
      }
    }

    const alertTokens = this.status.tokensUsed > (this.config.maxTokens * this.config.alertThresholdPercent);
    const alertTime = (Date.now() - this.startTime) > (this.config.maxTimeMs * this.config.alertThresholdPercent);

    if (alertTokens || alertTime) {
      this.status.isAlerting = true;
    }
  }
}
