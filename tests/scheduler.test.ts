import { describe, expect, it } from 'vitest'
import { nextJakartaRun } from '../shared/utils/scheduler'

describe('daily novel scheduler', () => {
  it('starts at the selected Jakarta time tomorrow', () => {
    const from = new Date('2026-08-31T10:00:00.000Z') // 17:00 in Jakarta
    expect(nextJakartaRun('06:00', from).toISOString()).toBe('2026-08-31T23:00:00.000Z')
  })

  it('preserves a custom daily time', () => {
    const from = new Date('2026-12-31T20:00:00.000Z') // 03:00 Jan 1 in Jakarta
    expect(nextJakartaRun('21:30', from).toISOString()).toBe('2027-01-02T14:30:00.000Z')
  })
})
