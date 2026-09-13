import { afterEach, describe, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', () => ({ readFile: read, mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn() }))
vi.mock('../server/services/storage', () => ({ dataRoot: () => '/tmp/inkrail-test' }))
import { getDownloadSettings, waitDownloadCooldown } from '../server/services/download-settings'
describe('download cooldown toggle', () => {
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })
  it('defaults new sources to rate limiting on', async () => {
    read.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }))
    expect(await getDownloadSettings('hitomi')).toEqual({ source: 'hitomi', rateLimit: true })
  })
  it('skips the entire cooldown when disabled', async () => {
    vi.useFakeTimers()
    read.mockResolvedValue('{"rateLimit":false}')
    await waitDownloadCooldown('nhentai', 120_000)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('releases an active cooldown when the toggle changes', async () => {
    vi.useFakeTimers()
    read.mockResolvedValueOnce('{"rateLimit":true}').mockResolvedValue('{"rateLimit":false}')
    let finished = false
    const pending = waitDownloadCooldown('hitomi', 120_000).then(() => { finished = true })
    await vi.advanceTimersByTimeAsync(999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(finished).toBe(true)
  })
})
