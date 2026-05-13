/**
 * CronParser — 3.0 P1
 *
 * Lightweight 5-field cron expression parser and evaluator.
 * Supports: * | number | n-m | step (via /step notation) | n,m,...
 * Fields: minute(0-59) hour(0-23) dayOfMonth(1-31) month(1-12) dayOfWeek(0-6)
 */

export interface ParsedCron {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

type CronField =
  | { readonly type: 'any' }
  | { readonly type: 'value'; readonly value: number }
  | { readonly type: 'list'; readonly values: readonly number[] }
  | { readonly type: 'step'; readonly step: number }
  | { readonly type: 'range'; readonly min: number; readonly max: number }
  | { readonly type: 'range_step'; readonly min: number; readonly max: number; readonly step: number };

/**
 * Parse a 5-field cron expression into a structured form.
 * Throws if the expression is malformed.
 */
export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 fields): "${expression}"`);
  }
  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts as [
    string, string, string, string, string,
  ];
  return {
    minute: parseField(minuteRaw, 0, 59),
    hour: parseField(hourRaw, 0, 23),
    dayOfMonth: parseField(domRaw, 1, 31),
    month: parseField(monthRaw, 1, 12),
    dayOfWeek: parseField(dowRaw, 0, 6),
  };
}

/**
 * Returns true when the given Date matches the parsed cron expression.
 * Note: seconds are ignored — comparison is minute-level.
 */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  return (
    matchesField(date.getMinutes(), cron.minute) &&
    matchesField(date.getHours(), cron.hour) &&
    matchesField(date.getDate(), cron.dayOfMonth) &&
    matchesField(date.getMonth() + 1, cron.month) &&
    matchesField(date.getDay(), cron.dayOfWeek)
  );
}

/**
 * Find the next Date (minute precision) after `after` that matches the cron.
 * Brute-force minute-by-minute search, capped at 1 year.
 */
export function nextRunAfter(cron: ParsedCron, after: Date): Date {
  // Advance to next whole minute
  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60_000);

  const limit = new Date(after.getTime() + 366 * 24 * 60 * 60 * 1000);
  while (candidate < limit) {
    if (cronMatches(cron, candidate)) return new Date(candidate.getTime());
    candidate.setTime(candidate.getTime() + 60_000);
  }
  throw new Error('No matching cron time found within 1 year');
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseField(raw: string, min: number, max: number): CronField {
  if (raw === '*') return { type: 'any' };

  // */step
  if (raw.startsWith('*/')) {
    const step = Number(raw.slice(2));
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step: ${raw}`);
    return { type: 'step', step };
  }

  // comma-separated list
  if (raw.includes(',')) {
    const values = raw.split(',').map((v) => {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new Error(`Invalid list value: ${v}`);
      return n;
    });
    return { type: 'list', values };
  }

  // range: n-m or n-m/step
  if (raw.includes('-')) {
    const [rangePart, stepPart] = raw.split('/');
    const [lo, hi] = (rangePart ?? '').split('-').map(Number);
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`Invalid range: ${raw}`);
    if (stepPart !== undefined) {
      const step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid range step: ${raw}`);
      return { type: 'range_step', min: lo, max: hi, step };
    }
    return { type: 'range', min: lo, max: hi };
  }

  // single value
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`Invalid cron field value: ${raw}`);
  if (n < min || n > max) throw new Error(`Cron value ${n} out of range [${min},${max}]`);
  return { type: 'value', value: n };
}

function matchesField(value: number, field: CronField): boolean {
  switch (field.type) {
    case 'any':
      return true;
    case 'value':
      return value === field.value;
    case 'list':
      return field.values.includes(value);
    case 'step':
      return value % field.step === 0;
    case 'range':
      return value >= field.min && value <= field.max;
    case 'range_step': {
      if (value < field.min || value > field.max) return false;
      return (value - field.min) % field.step === 0;
    }
  }
}
