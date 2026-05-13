import type { CumulativeUsage } from '../../types/agent-events.js';

/** Truncate a string to at most n chars, appending "…" if cut. */
export const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

/** Compact JSON preview for tool inputs. */
export const previewJson = (v: unknown, n = 120): string =>
  truncate(JSON.stringify(v, null, 0), n);

/** Human-friendly token count: 1234 → "1.2k". */
export const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

/** Sonnet-4 pricing per 1M tokens (USD). */
const SONNET_RATES = { input: 3, output: 15 } as const;

/**
 * Estimate session cost in USD.
 * Cache reads are priced at ~10% of normal input rate.
 */
export const estimateCost = (
  u: CumulativeUsage,
  rates: { input: number; output: number } = SONNET_RATES,
): number =>
  (u.totalInputTokens * rates.input + u.totalOutputTokens * rates.output) / 1_000_000;

/** Format a cost value as a fixed-precision dollar string. */
export const formatCost = (usd: number): string => `$${usd.toFixed(4)}`;

/** Format milliseconds as "45s" or "3m 12s". */
export const formatDurationMs = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
};
