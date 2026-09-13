import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { basename } from 'node:path'

type Pending = { resolve: (value: any) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }
type Timing = { startupMs?: number, threadStartMs?: number, turnAckMs?: number, turnStartedAt?: number, firstOutputAt?: number, firstOutputKind?: string, turnCompletedAt?: number, cleanupMs?: number, threadId?: string }
type Active = { threadId: string, turnId?: string, text: string, timing: Timing, resolve: (text: string) => void, reject: (error: Error) => void }
export interface CodexRunOptions {
  cwd: string
  prompt: string
  model?: string
  effort?: string
  outputSchema?: unknown
  referenceImage?: string | null
  sandbox?: 'read-only' | 'workspace-write'
  signal?: AbortSignal
}

// One instance per Node worker. Calls are serialized; every call starts a new thread.
export class CodexAppServer {
  private child?: ChildProcessWithoutNullStreams
  private ready?: Promise<void>
  private sequence = 0
  private pending = new Map<number, Pending>()
  private active?: Active
  private queue: Promise<unknown> = Promise.resolve()
  private stderr = ''

  constructor(private options: { executable?: string, args?: string[], requestTimeoutMs?: number, turnTimeoutMs?: number } = {}) {}

  get pid() { return this.child?.pid }

  start(): Promise<void> {
    if (this.ready) return this.ready
    const child = spawn(this.options.executable || process.env.CODEX_EXECUTABLE || (process.platform === 'win32' ? 'codex.exe' : 'codex'),
      this.options.args || ['app-server', '--listen', 'stdio://', '-c', 'memories.use_memories=false', '-c', 'memories.generate_memories=false'],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child = child
    this.stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000) })
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      if (this.child !== child) return
      try { this.receive(JSON.parse(line)) } catch { this.fail(new Error('Invalid JSON from Codex app-server')) }
    })
    child.on('error', error => { if (this.child === child) this.fail(error) })
    child.stdin.on('error', error => { if (this.child === child) this.fail(error) })
    child.on('close', code => {
      lines.close()
      if (this.child === child) this.fail(new Error(`Codex app-server exited with ${code}: ${this.stderr.slice(-1200)}`))
    })
    this.ready = this.request('initialize', { clientInfo: { name: 'inkrail_worker', version: '1.0.0' }, capabilities: null })
      .then(() => { this.send({ method: 'initialized' }) })
      .catch(error => { if (this.child === child) this.fail(error); throw error })
    return this.ready
  }

  private send(message: unknown) {
    if (!this.child || this.child.stdin.destroyed) throw new Error('Codex app-server is not connected')
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex app-server timed out: ${method}`)), this.options.requestTimeoutMs ?? 60_000)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (error) { this.fail(error as Error) }
    })
  }

  private receive(message: any) {
    if (message.method && message.id !== undefined) {
      // This unattended worker cannot answer interactive tool/approval requests.
      this.send({ id: message.id, error: { code: -32601, message: 'Interactive requests are unsupported by Inkrail workers' } })
      if (this.active) this.fail(new Error(`Codex requested unsupported interaction: ${message.method}`))
      return
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      message.error ? pending.reject(new Error(message.error.message || 'Codex request failed')) : pending.resolve(message.result)
      return
    }
    const active = this.active
    const params = message.params
    if (!active || params?.threadId !== active.threadId) return
    const modelOutput = ['item/agentMessage/delta', 'item/reasoning/textDelta', 'item/reasoning/summaryTextDelta'].includes(message.method)
      || (['item/started', 'item/completed'].includes(message.method) && ['agentMessage', 'reasoning', 'commandExecution', 'mcpToolCall', 'fileChange', 'webSearch', 'imageGeneration'].includes(params.item?.type))
    if (modelOutput && active.timing.firstOutputAt === undefined) {
      active.timing.firstOutputAt = performance.now()
      active.timing.firstOutputKind = params.item?.type || message.method
    }
    if (message.method === 'turn/started') active.turnId = params.turn.id
    if (message.method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary') active.text = params.item.text
    if (message.method === 'turn/completed') {
      if (active.turnId && params.turn.id !== active.turnId) return
      active.timing.turnCompletedAt = performance.now()
      if (params.turn.status === 'completed') active.resolve(active.text)
      else active.reject(new Error(params.turn.error?.message || `Codex turn ${params.turn.status}`))
    }
  }

  private fail(error: Error) {
    const child = this.child
    this.child = undefined
    this.ready = undefined
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
    this.active?.reject(error)
    this.active = undefined
    if (child) {
      child.stdin.end()
      // Terminate only this client's process tree, including any running tool.
      if (child.pid && child.exitCode === null) {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
          killer.on('error', () => { child.kill() })
        } else child.kill('SIGTERM')
      }
    }
  }

  close() { this.fail(new Error('Codex worker stopped')) }

  run(options: CodexRunOptions): Promise<{ text: string, threadId: string, pid: number | undefined }> {
    const queuedAt = performance.now()
    const result = this.queue.then(async () => {
      const startedAt = performance.now()
      let status = 'failed'
      let threadId: string | undefined
      const timing: Timing = {}
      try {
        const result = await this.runFresh(options, timing)
        threadId = result.threadId
        status = 'completed'
        return result
      } finally {
        if (options.signal?.aborted) status = 'cancelled'
        const durationMs = Math.round(performance.now() - startedAt)
        console.log('[codex timing]', JSON.stringify({
          timestamp: new Date().toISOString(), jobId: basename(options.cwd), threadId: threadId || timing.threadId,
          status, durationMs, durationSeconds: Number((durationMs / 1000).toFixed(3)),
          queueWaitMs: Math.round(startedAt - queuedAt), workerPid: process.pid,
          phases: {
            startupMs: timing.startupMs ?? null, threadStartMs: timing.threadStartMs ?? null,
            turnAckMs: timing.turnAckMs ?? null,
            firstOutputMs: timing.firstOutputAt !== undefined && timing.turnStartedAt !== undefined ? Math.round(timing.firstOutputAt - timing.turnStartedAt) : null,
            firstOutputKind: timing.firstOutputKind || null,
            afterFirstOutputMs: timing.turnCompletedAt !== undefined && timing.firstOutputAt !== undefined ? Math.round(timing.turnCompletedAt - timing.firstOutputAt) : null,
            turnMs: timing.turnCompletedAt !== undefined && timing.turnStartedAt !== undefined ? Math.round(timing.turnCompletedAt - timing.turnStartedAt) : null,
            cleanupMs: timing.cleanupMs ?? null
          }
        }))
      }
    })
    this.queue = result.catch(() => undefined)
    return result
  }

  private async runFresh(options: CodexRunOptions, timing: Timing) {
    options.signal?.throwIfAborted()
    const startupAt = performance.now()
    await this.start()
    timing.startupMs = Math.round(performance.now() - startupAt)
    options.signal?.throwIfAborted()
    const threadStartedAt = performance.now()
    const { thread } = await this.request('thread/start', {
      cwd: options.cwd, ephemeral: true, approvalPolicy: 'never', sandbox: options.sandbox || 'read-only',
      ...(options.model ? { model: options.model } : {}),
      config: { 'memories.use_memories': false, 'memories.generate_memories': false }
    })
    timing.threadStartMs = Math.round(performance.now() - threadStartedAt)
    timing.threadId = thread.id
    const pid = this.pid
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortTimer: ReturnType<typeof setTimeout> | undefined
    let interrupting = false
    const interrupt = () => {
      if (!this.active?.turnId || interrupting) return
      interrupting = true
      abortTimer = setTimeout(() => this.fail(new Error('Codex cancellation timed out')), 10_000)
      void this.request('turn/interrupt', { threadId: thread.id, turnId: this.active.turnId })
        .catch(error => this.fail(error))
    }
    try {
      options.signal?.throwIfAborted()
      const completion = new Promise<string>((resolve, reject) => {
        this.active = { threadId: thread.id, text: '', timing, resolve, reject }
      })
      // Attach immediately, including while turn/start is waiting for its response.
      void completion.catch(() => undefined)
      timer = setTimeout(() => this.fail(new Error('Codex turn timed out')), this.options.turnTimeoutMs ?? 30 * 60_000)
      options.signal?.addEventListener('abort', interrupt, { once: true })
      timing.turnStartedAt = performance.now()
      const result = await this.request('turn/start', {
        threadId: thread.id,
        input: [{ type: 'text', text: options.prompt }, ...(options.referenceImage ? [{ type: 'localImage', path: options.referenceImage }] : [])],
        ...(options.effort ? { effort: options.effort } : {}),
        ...(options.outputSchema ? { outputSchema: options.outputSchema } : {})
      })
      timing.turnAckMs = Math.round(performance.now() - timing.turnStartedAt)
      if (this.active) this.active.turnId = result.turn.id
      if (options.signal?.aborted) interrupt()
      const text = await completion
      options.signal?.throwIfAborted()
      return { text, threadId: thread.id, pid }
    } finally {
      const cleanupAt = performance.now()
      clearTimeout(timer)
      clearTimeout(abortTimer)
      options.signal?.removeEventListener('abort', interrupt)
      this.active = undefined
      if (this.child) {
        // Ephemeral threads aren't saved; release the subscription after each call.
        await this.request('thread/unsubscribe', { threadId: thread.id }).catch(error => this.fail(error))
      }
      timing.cleanupMs = Math.round(performance.now() - cleanupAt)
    }
  }
}

export const codexWorker = new CodexAppServer()
