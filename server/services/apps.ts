import { execFile } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { promisify } from 'node:util'
import { identifyWebApp, parseListeningPorts, type AppListener } from '~/server/utils/app-listeners'

const execFileAsync = promisify(execFile)
const state = globalThis as unknown as { inkrailAppScan?: { expiresAt: number, value: Promise<Awaited<ReturnType<typeof scan>>> } }

type Probe = { protocol: 'http' | 'https', status: number, title: string, server: string, path: string, elapsedMs: number }

function probeHost(listener: AppListener) {
  const addresses = listener.addresses
  if (addresses.some(address => address === '0.0.0.0')) return '127.0.0.1'
  if (addresses.some(address => address === '::')) return '::1'
  return addresses.find(address => address === '127.0.0.1' || address === '::1') || addresses[0]
}

function scope(listener: AppListener) {
  if (listener.addresses.some(address => address === '0.0.0.0' || address === '::' || address.startsWith('100.'))) return 'tailnet'
  if (listener.addresses.every(address => address === '127.0.0.1' || address === '::1')) return 'local'
  return 'lan'
}

function probe(listener: AppListener, protocol: 'http' | 'https'): Promise<Probe | null> {
  const host = probeHost(listener)
  const transport = protocol === 'https' ? https : http
  const started = performance.now()
  return new Promise(resolve => {
    let settled = false
    const finish = (value: Probe | null) => { if (!settled) { settled = true; resolve(value) } }
    const request = transport.request({
      host,
      port: listener.port,
      path: '/',
      method: 'GET',
      timeout: 900,
      rejectUnauthorized: false,
      headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.5', 'user-agent': 'Inkrail-App-Discovery/1.0' }
    }, response => {
      const chunks: Buffer[] = []
      let length = 0
      response.on('data', (chunk: Buffer) => {
        if (length < 64 * 1024) { chunks.push(chunk); length += chunk.length }
        if (length >= 64 * 1024) {
          const body = Buffer.concat(chunks).toString('utf8')
          const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
          const location = response.headers.location || '/'
          finish({ protocol, status: response.statusCode || 0, title, server: String(response.headers.server || ''), path: location.startsWith('/') ? location : '/', elapsedMs: Math.round(performance.now() - started) })
          response.destroy()
        }
      })
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
        const location = response.headers.location || '/'
        const path = location.startsWith('/') ? location : '/'
        finish({ protocol, status: response.statusCode || 0, title, server: String(response.headers.server || ''), path, elapsedMs: Math.round(performance.now() - started) })
      })
      response.on('close', () => {
        if (!settled && response.complete) {
          const body = Buffer.concat(chunks).toString('utf8')
          const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
          const location = response.headers.location || '/'
          finish({ protocol, status: response.statusCode || 0, title, server: String(response.headers.server || ''), path: location.startsWith('/') ? location : '/', elapsedMs: Math.round(performance.now() - started) })
        }
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => finish(null))
    request.end()
  })
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index])
    }
  }))
  return results
}

async function scan() {
  const started = performance.now()
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 5_000 })
  const listeners = parseListeningPorts(stdout)
  const apps = (await mapLimit(listeners, 8, async listener => {
    const plain = await probe(listener, 'http')
    const secure = !plain || (plain.status === 400 && !plain.title) ? await probe(listener, 'https') : null
    const result = secure || plain
    if (!result) return null
    const identity = identifyWebApp(listener.port, result.title, result.server)
    const path = identity.name === 'Plex' && result.path === '/' ? '/web/index.html' : result.path
    return { ...listener, ...result, path, ...identity, scope: scope(listener) }
  })).filter((app): app is NonNullable<typeof app> => Boolean(app))
  return { scannedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), listeners: listeners.length, apps }
}

export async function discoverWebApps(force = false) {
  if (force || !state.inkrailAppScan || state.inkrailAppScan.expiresAt <= Date.now()) {
    state.inkrailAppScan = { expiresAt: Date.now() + 15_000, value: scan() }
  }
  const current = state.inkrailAppScan
  try { return await current.value } catch (error) {
    state.inkrailAppScan = undefined
    throw error
  }
}
