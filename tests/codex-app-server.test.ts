import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { CodexAppServer } from '../server/services/codex-app-server'

const clients: CodexAppServer[] = []
function client(timeouts = {}) {
  const value = new CodexAppServer({ executable: process.execPath, args: [resolve('tests/fixtures/codex-app-server.mjs')], requestTimeoutMs: 2000, ...timeouts })
  clients.push(value)
  return value
}
afterEach(() => { for (const value of clients.splice(0)) value.close() })
const run = (value: CodexAppServer, prompt: string, extra = {}) => value.run({ cwd: process.cwd(), prompt, ...extra })

describe('persistent Codex worker', () => {
  it('separates first model activity from acknowledgement and subsequent generation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await run(client(), 'timed')
      const timing = JSON.parse(log.mock.calls.find(call => call[0] === '[codex timing]')![1])
      expect(timing.phases.firstOutputKind).toBe('item/reasoning/textDelta')
      expect(timing.phases.firstOutputMs).toBeGreaterThanOrEqual(30)
      expect(timing.phases.afterFirstOutputMs).toBeGreaterThanOrEqual(30)
      expect(timing.phases.turnMs).toBeGreaterThanOrEqual(60)
      expect(timing.phases.cleanupMs).toBeGreaterThanOrEqual(0)
    } finally { log.mockRestore() }
  })
  it('serializes calls with distinct ephemeral threads in the same process and preserves output settings', async () => {
    const value = client()
    const [a, b] = await Promise.all([run(value, 'first', { model: 'configured-model', effort: 'low', outputSchema: { type: 'object' } }), run(value, 'second')])
    expect(a.pid).toBe(b.pid)
    expect(a.threadId).not.toBe(b.threadId)
    const output = JSON.parse(a.text)
    expect(output.settings).toMatchObject({ sandbox: 'read-only', approvalPolicy: 'never', model: 'configured-model', ephemeral: true })
    expect(output.turn).toMatchObject({ effort: 'low', outputSchema: { type: 'object' } })
    expect(JSON.parse(b.text).prompt).toBe('second')
  })
  it('interrupts a turn while retaining the process for the next job', async () => {
    const value = client()
    await value.start()
    const pid = value.pid
    const controller = new AbortController()
    const pending = run(value, 'wait', { signal: controller.signal })
    const rejected = expect(pending).rejects.toThrow()
    setTimeout(() => controller.abort(), 100)
    await rejected
    expect((await run(value, 'next')).pid).toBe(pid)
  })
  it('does not start work for an already cancelled job', async () => {
    const value = client()
    await expect(run(value, 'first', { signal: AbortSignal.abort() })).rejects.toThrow()
    expect(value.pid).toBeUndefined()
  })
  it('rejects a crashed job and launches a replacement process for the next job', async () => {
    const value = client()
    await value.start()
    const pid = value.pid
    await expect(run(value, 'crash')).rejects.toThrow('exited')
    expect((await run(value, 'next')).pid).not.toBe(pid)
  })
  it('rejects failed turns without poisoning the queue', async () => {
    const value = client()
    await expect(run(value, 'fail')).rejects.toThrow('fixture failure')
    expect(JSON.parse((await run(value, 'next')).text).prompt).toBe('next')
  })
  it('bounds unresponsive RPCs and recovers', async () => {
    const value = client({ requestTimeoutMs: 300 })
    await expect(run(value, 'hang-rpc')).rejects.toThrow('timed out')
    expect(JSON.parse((await run(value, 'next')).text).prompt).toBe('next')
  })
  it('bounds stalled turns and preserves image input and sandbox mode', async () => {
    const value = client({ turnTimeoutMs: 200 })
    await expect(run(value, 'wait')).rejects.toThrow('turn timed out')
    const result = JSON.parse((await run(value, 'image', { sandbox: 'workspace-write', referenceImage: 'reference.png' })).text)
    expect(result.settings.sandbox).toBe('workspace-write')
    expect(result.turn.input[1]).toEqual({ type: 'localImage', path: 'reference.png' })
  })
})
