import { describe, expect, it, vi } from 'vitest'
import { ImageQueue } from '../shared/utils/image-queue'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
describe('reader image queue', () => {
  it('prioritizes the new reading window and aborts obsolete work', async () => {
    const started: string[] = [], signals = new Map<string, AbortSignal>(), resolves = new Map<string, (value: string) => void>()
    const done = vi.fn()
    const queue = new ImageQueue<string>((url, signal) => new Promise(resolve => { started.push(url); signals.set(url, signal); resolves.set(url, resolve) }), done, 2)
    queue.setWindow(['one', 'two', 'three'])
    expect(started).toEqual(['one', 'two'])
    queue.setWindow(['ten', 'eleven'])
    expect(signals.get('one')?.aborted).toBe(true)
    expect(signals.get('two')?.aborted).toBe(true)
    resolves.get('one')!('one'); resolves.get('ten')!('ten')
    await tick()
    expect(done).not.toHaveBeenCalledWith('one', 'one')
    expect(done).toHaveBeenCalledWith('ten', 'ten')
    expect(started).not.toContain('three')
    queue.dispose()
  })
  it('reuses decoded local images and retries failed pages only on request', async () => {
    const loader = vi.fn(async (url: string) => { if (url === 'broken') throw new Error('offline'); return url })
    const queue = new ImageQueue(loader, vi.fn(), 1)
    queue.setWindow(['/api/manga/pages/local/image?v=1', 'broken'])
    await tick(); await tick()
    expect(loader).toHaveBeenCalledTimes(2)
    queue.setWindow(['/api/manga/pages/local/image?v=1'])
    expect(loader).toHaveBeenCalledTimes(2)
    queue.retry('broken'); await tick()
    expect(loader).toHaveBeenCalledTimes(3)
    queue.dispose()
  })
})
