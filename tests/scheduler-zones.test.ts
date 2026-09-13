import { describe, expect, it } from 'vitest'
import { nextZonedRun, validTimezone } from '../shared/utils/scheduler'
describe('schedule timezone conversion', () => {
  it('keeps Jakarta tomorrow semantics', () => expect(nextZonedRun('06:00', 'Asia/Jakarta', new Date('2026-09-13T07:00:00Z')).toISOString()).toBe('2026-09-13T23:00:00.000Z'))
  it('handles a negative offset', () => expect(nextZonedRun('06:00', 'America/New_York', new Date('2026-09-13T07:00:00Z')).toISOString()).toBe('2026-09-14T10:00:00.000Z'))
  it('uses the next valid minute in a DST gap', () => expect(nextZonedRun('02:30', 'America/New_York', new Date('2026-03-07T12:00:00Z')).toISOString()).toBe('2026-03-08T07:00:00.000Z'))
  it('chooses the first repeated time in a DST overlap', () => expect(nextZonedRun('01:30', 'America/New_York', new Date('2026-10-31T12:00:00Z')).toISOString()).toBe('2026-11-01T05:30:00.000Z'))
  it('rejects unknown zones', () => { expect(validTimezone('Unknown/Zone')).toBe(false); expect(() => nextZonedRun('06:00', 'Unknown/Zone')).toThrow() })
})
