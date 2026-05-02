/**
 * DriftDetector — 3.0 P1
 *
 * Tracks token consumption and failure streaks per contract.
 * Used by RecurringScheduler to decide whether to pause a contract.
 */

export interface DriftLimits {
  /** Maximum tokens consumed per calendar day across all runs */
  dailyTokenBudget?: number;
  /** Maximum consecutive failures before the contract is paused */
  failureStreak?: number;
}

export interface DriftCheckResult {
  readonly drifted: boolean;
  readonly reason?: string;
  readonly metric?: 'daily_token_budget' | 'failure_streak';
  readonly value?: number;
  readonly threshold?: number;
}

interface RunRecord {
  success: boolean;
  tokensUsed: number;
  day: string; // YYYY-MM-DD
}

/**
 * In-memory drift tracker. State is intentionally ephemeral —
 * it resets on restart, which is acceptable for P1 (counters are soft guards).
 */
export class DriftDetector {
  private readonly history = new Map<string, RunRecord[]>();

  recordRun(
    contractId: string,
    result: { success: boolean; tokensUsed?: number },
  ): void {
    const records = this.history.get(contractId) ?? [];
    records.push({
      success: result.success,
      tokensUsed: result.tokensUsed ?? 0,
      day: todayKey(),
    });
    // Keep last 100 entries per contract
    while (records.length > 100) records.shift();
    this.history.set(contractId, records);
  }

  checkDrift(contractId: string, limits: DriftLimits): DriftCheckResult {
    const records = this.history.get(contractId);
    if (!records || records.length === 0) return { drifted: false };

    // ── failure streak ────────────────────────────────────────────────────────
    if (limits.failureStreak !== undefined) {
      let streak = 0;
      for (let i = records.length - 1; i >= 0; i--) {
        const rec = records[i];
        if (rec && !rec.success) {
          streak++;
        } else {
          break;
        }
      }
      if (streak >= limits.failureStreak) {
        return {
          drifted: true,
          reason: `Consecutive failure streak of ${streak} reached threshold ${limits.failureStreak}`,
          metric: 'failure_streak',
          value: streak,
          threshold: limits.failureStreak,
        };
      }
    }

    // ── daily token budget ────────────────────────────────────────────────────
    if (limits.dailyTokenBudget !== undefined) {
      const today = todayKey();
      const dailyTokens = records
        .filter((r) => r.day === today)
        .reduce((sum, r) => sum + r.tokensUsed, 0);
      if (dailyTokens >= limits.dailyTokenBudget) {
        return {
          drifted: true,
          reason: `Daily token usage ${dailyTokens} reached budget ${limits.dailyTokenBudget}`,
          metric: 'daily_token_budget',
          value: dailyTokens,
          threshold: limits.dailyTokenBudget,
        };
      }
    }

    return { drifted: false };
  }

  /** Clear history for a contract (e.g. after revoke). */
  clear(contractId: string): void {
    this.history.delete(contractId);
  }
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
