import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, createPublicKey, verify, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { z } from 'zod'

export const sourceId = z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/)
const field = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), label: z.string(), type: z.enum(['text', 'secret', 'select']), options: z.array(z.string()).optional(), default: z.string().optional() })
export const manifestSchema = z.object({
  id: sourceId, name: z.string().min(1).max(120), version: z.string().regex(/^\d+\.\d+\.\d+$/), protocol: z.literal(1),
  entry: z.literal('index.mjs'), mediaType: z.enum(['NOVEL', 'MANGA']), contentRating: z.enum(['SAFE', 'ADULT']),
  language: z.string(), baseUrl: z.string().url(), icon: z.string().max(8).default('I'),
  capabilities: z.array(z.enum(['search', 'browse', 'chapters', 'pages', 'chapter', 'asset', 'resolve', 'browser'])),
  filters: z.array(field).default([]), settings: z.array(field).default([]),
  sourceLanguage: z.string().default('unknown')
})
const releaseSchema = z.object({ manifest: manifestSchema, url: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const indexSchema = z.object({ name: z.string().min(1), packages: z.array(releaseSchema).max(1000) })
export function fingerprint(key) { return createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex') }
export function signedIndex(envelope, expected) {
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || typeof envelope.publicKey !== 'string') throw new Error('Invalid signed repository')
  if (createPublicKey(envelope.publicKey).asymmetricKeyType !== 'ed25519') throw new Error('Repository must use Ed25519')
  const key = fingerprint(envelope.publicKey)
  if (key !== expected.replace(/:/g, '').toLowerCase()) throw new Error('Publisher fingerprint does not match')
  const payload = Buffer.from(envelope.payload, 'base64')
  if (!verify(null, payload, envelope.publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid repository signature')
  const index = indexSchema.parse(JSON.parse(payload.toString('utf8')))
  if (new Set(index.packages.map(p => p.manifest.id)).size !== index.packages.length) throw new Error('Duplicate source IDs')
  return { ...index, fingerprint: key }
}
export function unpackPackage(bytes, expected) {
  if (bytes.length > 24 * 1024 * 1024) throw new Error('Package exceeds 24 MiB')
  const value = JSON.parse(bytes.toString('utf8'))
  const manifest = manifestSchema.parse(value.manifest)
  if (JSON.stringify(manifest) !== JSON.stringify(manifestSchema.parse(expected))) throw new Error('Package manifest does not match signed release')
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('Invalid package files')
  const files = Object.entries(value.files)
  if (!files.length || files.length > 200 || !Object.hasOwn(value.files, 'index.mjs')) throw new Error('Invalid package file count or entry')
  for (const [path, content] of files) {
    if (!/^[a-zA-Z0-9_-]+(?:[./-][a-zA-Z0-9_-]+)*$/.test(path) || path.split('/').some(p => p === '..' || p === '.' || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)) || typeof content !== 'string') throw new Error('Unsafe package path or content')
  }
  if (new Set(files.map(([p]) => p.toLowerCase())).size !== files.length) throw new Error('Case-colliding package paths')
  return { manifest, files }
}
async function download(url, max, redirects = 0) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))) throw new Error('Use HTTPS (HTTP is allowed only on loopback for development)')
  if (parsed.username || parsed.password) throw new Error('Credentials in repository URLs are not supported')
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' })
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 5 || !response.headers.get('location')) throw new Error('Too many or invalid redirects')
    const next = new URL(response.headers.get('location'), url)
    if (parsed.protocol === 'https:' && next.protocol !== 'https:') throw new Error('HTTPS downgrade rejected')
    await response.body?.cancel()
    return download(next.href, max, redirects + 1)
  }
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)
  const chunks = []; let size = 0
  for await (const chunk of response.body) { size += chunk.length; if (size > max) throw new Error('Download size limit exceeded'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
const unavailable = () => Object.assign(new Error('Source unavailable. Install or enable its extension to resume.'), { code: 'SOURCE_UNAVAILABLE' })
class Runner {
  constructor(path, manifest, config, stateDir) {
    this.pending = new Map(); this.buffer = ''; this.manifest = manifest; this.lastUsed = Date.now()
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'PLAYWRIGHT_BROWSERS_PATH'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
    this.child = spawn(process.execPath, [resolve(process.cwd(), 'extensions/runner.mjs'), path], { cwd: dirname(path), env: { ...env, INKRAIL_SOURCE_CONFIG: JSON.stringify(config), DATA_DIR: stateDir }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk
      if (this.buffer.length > 48 * 1024 * 1024) return this.close(new Error('Source response too large'))
      let end
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1)
        try {
          const message = JSON.parse(line); const pending = this.pending.get(message.id)
          if (!pending) continue
          this.pending.delete(message.id); clearTimeout(pending.timer)
          if (message.error) pending.reject(Object.assign(new Error(String(message.error.message)), { code: message.error.code, statusCode: message.error.statusCode, data: message.error.data }))
          else pending.resolve(message.result)
        } catch { this.close(new Error('Invalid source protocol response')) }
      }
    })
    // Drain logs without forwarding secrets to the browser or persistent app logs.
    this.child.stderr.resume()
    this.child.on('error', error => this.close(error))
    this.child.on('exit', () => this.close(new Error('Source process exited')))
    this.child.stdin.on('error', error => this.close(error))
  }
  call(method, params = {}, timeout = 60000) {
    if (this.closed) return Promise.reject(unavailable())
    this.lastUsed = Date.now()
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => { this.child.stdin.write(JSON.stringify({ method: '$cancel', params: { id } }) + '\n'); this.close(Object.assign(new Error('Source request timed out'), { code: 'TIMEOUT' })) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
  async drain() {
    const until = Date.now() + 65000
    while (this.pending.size && Date.now() < until && !this.closed) await new Promise(r => setTimeout(r, 25))
    if (this.pending.size) throw new Error('Source is busy; retry after current requests finish')
  }
  close(error = unavailable()) {
    if (this.closed) return
    this.closed = true
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error) }
    this.pending.clear()
    if (this.child.pid && process.platform === 'win32') spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    else this.child.kill('SIGTERM')
  }
}

export class ExtensionManager {
  constructor(root) { this.root = resolve(root, 'extensions'); this.runners = new Map(); this.starting = new Map(); this.barrier = Promise.resolve(); this.state = null }
  async load() {
    if (this.state) return this.state
    try { this.state = JSON.parse(await readFile(resolve(this.root, 'registry.json'), 'utf8')) }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.state = { repositories: [], installed: {}, owners: {} } }
    return this.state
  }
  async save(state) {
    await mkdir(this.root, { recursive: true })
    const temp = resolve(this.root, `registry.${randomUUID()}.tmp`)
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(temp, resolve(this.root, 'registry.json')); this.state = state
  }
  mutate(fn) { const task = this.barrier.then(fn); this.barrier = task.catch(() => {}); return task }
  async list() {
    await this.barrier; const state = await this.load()
    return { repositories: state.repositories, installed: Object.values(state.installed).map(item => ({ ...item, config: undefined, configuredKeys: Object.keys(item.config || {}), running: !this.runners.get(item.manifest.id)?.closed && this.runners.has(item.manifest.id) })) }
  }
  async sources() { return (await this.list()).installed.filter(i => i.enabled).map(i => i.manifest) }
  async addRepository(url, key) {
    return this.mutate(async () => {
      const index = signedIndex(JSON.parse((await download(url, 2 * 1024 * 1024)).toString()), key)
      const state = structuredClone(await this.load())
      if (state.repositories.some(r => r.fingerprint === index.fingerprint)) throw new Error('Publisher already added; refresh its repository')
      state.repositories.push({ ...index, url }); await this.save(state); return index
    })
  }
  async refreshRepository(key) {
    return this.mutate(async () => {
      const state = structuredClone(await this.load()); const repo = state.repositories.find(r => r.fingerprint === key)
      if (!repo) throw new Error('Repository not found')
      Object.assign(repo, signedIndex(JSON.parse((await download(repo.url, 2 * 1024 * 1024)).toString()), key)); await this.save(state)
    })
  }
  async removeRepository(key) {
    return this.mutate(async () => { const state = structuredClone(await this.load()); state.repositories = state.repositories.filter(r => r.fingerprint !== key); await this.save(state) })
  }
  async boot(item) {
    const id = item.manifest.id
    const stateDir = resolve(this.root, 'state', id); await mkdir(stateDir, { recursive: true })
    const runner = new Runner(resolve(this.root, 'packages', item.directory, 'index.mjs'), item.manifest, item.config || {}, stateDir)
    try { const health = await runner.call('health', {}, 10000); if (health?.protocol !== 1 || !item.manifest.capabilities.every(method => health.methods?.includes(method))) throw new Error('Incompatible source handshake or missing capability'); return runner }
    catch (error) { runner.close(); throw error }
  }
  async install(key, id) {
    sourceId.parse(id)
    return this.mutate(async () => {
      const state = structuredClone(await this.load()); const repo = state.repositories.find(r => r.fingerprint === key)
      const release = repo?.packages.find(p => p.manifest.id === id)
      if (!release) throw new Error('Release not found')
      if (state.owners[id] && state.owners[id] !== key) throw new Error('Source ID belongs to a different publisher')
      const old = state.installed[id]
      if (old) {
        const a = release.manifest.version.split('.').map(Number), b = old.manifest.version.split('.').map(Number)
        let cmp = 0; for (let i = 0; i < 3 && !cmp; i++) cmp = a[i] - b[i]
        if (cmp <= 0) throw new Error('Install requires a newer version; use rollback for previous versions')
      }
      const bytes = await download(release.url, 24 * 1024 * 1024)
      if (createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('Package checksum mismatch')
      const { manifest, files } = unpackPackage(bytes, release.manifest)
      const directory = `${id}-${manifest.version}-${randomUUID()}`
      const target = resolve(this.root, 'packages', directory)
      await mkdir(target, { recursive: true })
      let candidate
      try {
        for (const [path, content] of files) { const dest = resolve(target, path); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, content, { flag: 'wx' }) }
        const item = { manifest, directory, publisher: key, enabled: old?.enabled ?? true, config: old?.config || {}, previous: old ? { manifest: old.manifest, directory: old.directory } : null }
        candidate = await this.boot(item)
        const active = this.runners.get(id); if (active) await active.drain()
        state.installed[id] = item; state.owners[id] = key; await this.save(state)
        active?.close(); this.runners.delete(id)
        if (item.enabled) this.runners.set(id, candidate); else candidate.close()
      } catch (e) { candidate?.close(); await rm(target, { recursive: true, force: true }); throw e }
    })
  }
  async action(id, action, config) {
    sourceId.parse(id)
    return this.mutate(async () => {
      const state = structuredClone(await this.load()); const item = state.installed[id]
      if (!item) throw unavailable()
      if (action === 'rollback') {
        if (!item.previous) throw new Error('No previous version available')
        const previous = { manifest: item.manifest, directory: item.directory }; Object.assign(item, item.previous); item.previous = previous
      } else if (action === 'configure') {
        for (const [key, value] of Object.entries(config || {})) {
          const setting = item.manifest.settings.find(s => s.key === key)
          if (!setting || typeof value !== 'string' || value.length > 4096 || (setting.type === 'select' && !setting.options?.includes(value))) throw new Error('Invalid source setting')
          if (value) item.config[key] = value; else delete item.config[key]
        }
      } else if (action === 'enable') item.enabled = true
      else if (action === 'disable') item.enabled = false
      else if (action === 'uninstall') delete state.installed[id]
      else if (action !== 'restart') throw new Error('Unknown extension action')
      const active = this.runners.get(id); if (active) await active.drain()
      let candidate
      try {
        if (state.installed[id]?.enabled && ['rollback', 'enable', 'restart', 'configure'].includes(action)) candidate = await this.boot(item)
        await this.save(state)
        active?.close(); this.runners.delete(id); if (candidate) this.runners.set(id, candidate)
      } catch (e) { candidate?.close(); throw e }
    })
  }
  async invoke(id, method, params = {}) {
    sourceId.parse(id); await this.barrier
    const item = (await this.load()).installed[id]
    if (!item?.enabled) throw unavailable()
    const allowed = ['health', 'search', 'browse', 'metadata', 'chapters', 'pages', 'chapter', 'asset', 'resolve', 'browser']
    if (!allowed.includes(method) || (method !== 'health' && method !== 'metadata' && !item.manifest.capabilities.includes(method))) throw new Error('Source does not support this operation')
    let runner = this.runners.get(id)
    if (!runner || runner.closed) {
      let pending = this.starting.get(id)
      if (!pending) { pending = this.boot(item); this.starting.set(id, pending) }
      try { runner = await pending; this.runners.set(id, runner) } finally { this.starting.delete(id) }
    }
    const result = await runner.call(method, params)
    if (method === 'asset' && (typeof result?.base64 !== 'string' || result.base64.length > 44 * 1024 * 1024)) throw new Error('Invalid source asset')
    if (method === 'metadata' && (!result || typeof result.sourceNovelId !== 'string' || typeof result.titleOriginal !== 'string')) throw new Error('Invalid source metadata')
    return result
  }
  close() { for (const runner of this.runners.values()) runner.close(); this.runners.clear() }
}
