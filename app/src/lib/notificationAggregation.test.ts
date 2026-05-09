import { describe, expect, it } from 'vitest'
import {
  aggregateNotifications,
  type RawTaskRow,
} from './notificationAggregation'

const baseTime = new Date('2026-05-09T12:00:00Z').getTime()
function ts(offsetMin: number): string {
  return new Date(baseTime + offsetMin * 60_000).toISOString()
}
function row(over: Partial<RawTaskRow>): RawTaskRow {
  return {
    id: 'x',
    state: 'completed',
    skill_name: 'standup',
    trigger_kind: 'manual',
    message: null,
    updated_at: ts(0),
    ...over,
  }
}

describe('aggregateNotifications', () => {
  const now = baseTime + 30 * 60_000 // 12:30Z

  it('keeps awaiting-signoff items at the top, individually', () => {
    const groups = aggregateNotifications(
      [
        row({ id: 'a', state: 'awaiting-signoff', skill_name: 'feishu' }),
        row({ id: 'b', state: 'awaiting-signoff', skill_name: 'feishu' }),
      ],
      { nowMs: now },
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].kind).toBe('signoff')
    expect(groups[1].kind).toBe('signoff')
    expect(groups[0].title).toContain('待签批')
  })

  it('aggregates ≥3 same-skill completions inside the 1h window into one card', () => {
    const groups = aggregateNotifications(
      [
        row({ id: '1', updated_at: ts(0) }),
        row({ id: '2', updated_at: ts(10) }),
        row({ id: '3', updated_at: ts(20) }),
      ],
      { nowMs: now },
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('aggregate')
    expect(groups[0].count).toBe(3)
    expect(groups[0].title).toContain('standup')
    expect(groups[0].title).toContain('3')
  })

  it('keeps fewer-than-threshold completions as individual cards', () => {
    const groups = aggregateNotifications(
      [
        row({ id: '1', skill_name: 'standup', updated_at: ts(0) }),
        row({ id: '2', skill_name: 'standup', updated_at: ts(5) }),
      ],
      { nowMs: now },
    )
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.kind === 'completed')).toBe(true)
  })

  it('drops completions older than the 1h window', () => {
    const groups = aggregateNotifications(
      [row({ id: '1', updated_at: ts(-90) })],
      { nowMs: now },
    )
    expect(groups).toHaveLength(0)
  })

  it('keeps cancellations and failures as individual cards always', () => {
    const groups = aggregateNotifications(
      [
        row({ id: '1', state: 'failed', updated_at: ts(0) }),
        row({ id: '2', state: 'cancelled', updated_at: ts(5) }),
      ],
      { nowMs: now },
    )
    expect(groups.map((g) => g.kind).sort()).toEqual(['cancelled', 'failed'])
  })

  it('orders groups: signoff first, then aggregate, then individual completions', () => {
    const groups = aggregateNotifications(
      [
        row({ id: 'p1', state: 'awaiting-signoff', skill_name: 'feishu' }),
        row({ id: '1', skill_name: 'standup', updated_at: ts(0) }),
        row({ id: '2', skill_name: 'standup', updated_at: ts(5) }),
        row({ id: '3', skill_name: 'standup', updated_at: ts(10) }),
        row({ id: '4', skill_name: 'one-off', updated_at: ts(15) }),
      ],
      { nowMs: now },
    )
    expect(groups[0].kind).toBe('signoff')
    expect(groups[1].kind).toBe('aggregate')
    expect(groups[2].kind).toBe('completed')
  })
})
