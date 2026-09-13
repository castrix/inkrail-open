import { describe, expect, it, vi } from 'vitest'
import { cachedSourceSearch } from '../server/services/search-cache'

describe('source search cache', () => {
  it('coalesces concurrent cache misses', async () => {
    let complete!: (value: { results: number[] }) => void
    const loader = vi.fn(() => new Promise<{ results: number[] }>(resolve => { complete = resolve }))
    const first = cachedSourceSearch('test:concurrent', loader)
    const second = cachedSourceSearch('test:concurrent', loader, true)
    expect(loader).toHaveBeenCalledTimes(1)
    complete({ results: [1] })
    expect((await first).results).toEqual([1]); expect((await second).results).toEqual([1])
  })
  it('joins stale background refresh instead of fetching twice', async () => {
    vi.useFakeTimers()
    const loader = vi.fn(async () => ({ results: [1] }))
    await cachedSourceSearch('test:stale', loader)
    vi.advanceTimersByTime(6 * 60_000)
    const stale = await cachedSourceSearch('test:stale', loader)
    expect(stale._cache.state).toBe('stale')
    await cachedSourceSearch('test:stale', loader, true)
    expect(loader).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
