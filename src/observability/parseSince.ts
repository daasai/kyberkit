/**
 * Parse CLI window strings like `7d`, `12h`, `30m`, or a raw millisecond integer.
 */
export function parseSinceToMs(raw: string): number {
  const s = raw.trim();
  const asNum = Number(s);
  if (!Number.isNaN(asNum) && s.match(/^\d+$/)) {
    return asNum;
  }
  const m = s.match(/^(\d+)\s*(d|days?|h|hours?|m|mins?|minutes?|ms)?$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1]!, 10);
  const u = (m[2] ?? 'd').toLowerCase();
  if (u === 'ms') return n;
  if (u === 'm' || u.startsWith('min')) return n * 60 * 1000;
  if (u === 'h' || u.startsWith('hour')) return n * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}
