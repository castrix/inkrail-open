import { createServer, type Server } from 'node:http'
import { isIP, connect, type Socket } from 'node:net'

type CacheEntry = { addresses: string[], expiresAt: number }
type ProxyState = { server: Server, url: string, port: number, resolverServers: string[], cache: Map<string, CacheEntry> }

const globalDns = globalThis as unknown as { inkrailScraperDns?: Promise<ProxyState> }

function configuredServers() {
  return (process.env.SCRAPER_DNS_SERVERS || '1.1.1.1,1.0.0.1').split(',').map(server => server.trim()).filter(Boolean)
}

function authority(value: string) {
  if (value.startsWith('[')) {
    const closing = value.indexOf(']')
    return { host: value.slice(1, closing), port: Number(value.slice(closing + 2)) || 443 }
  }
  const separator = value.lastIndexOf(':')
  return { host: separator > 0 ? value.slice(0, separator) : value, port: separator > 0 ? Number(value.slice(separator + 1)) || 443 : 443 }
}

async function resolveHost(state: ProxyState, host: string) {
  if (isIP(host)) return [host]
  const key = host.toLowerCase()
  const cached = state.cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.addresses
  let lastError: unknown
  for (const server of state.resolverServers) {
    try {
      const response = await fetch(`https://${server}/dns-query?name=${encodeURIComponent(key)}&type=A`, {
        headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8_000)
      })
      if (!response.ok) throw new Error(`Cloudflare DoH returned HTTP ${response.status}`)
      const payload = await response.json() as { Status?: number, Answer?: Array<{ type?: number, TTL?: number, data?: string }> }
      if (payload.Status !== 0) throw new Error(`Cloudflare DoH returned DNS status ${payload.Status}`)
      const records = (payload.Answer || []).filter(record => record.type === 1 && record.data && isIP(record.data) === 4)
      if (!records.length) throw new Error(`Cloudflare DoH returned no IPv4 addresses for ${host}`)
      const ttl = Math.min(300, Math.max(30, ...records.map(record => record.TTL || 60)))
      const addresses = records.map(record => record.data!)
      state.cache.set(key, { addresses, expiresAt: Date.now() + ttl * 1000 })
      return addresses
    } catch (error) { lastError = error }
  }
  throw lastError instanceof Error ? lastError : new Error(`Inkrail DNS could not resolve ${host}`)
}

function openSocket(addresses: string[], port: number) {
  return new Promise<Socket>((resolve, reject) => {
    let cursor = 0
    let lastError: Error | undefined
    const attempt = () => {
      const address = addresses[cursor++]
      if (!address) return reject(lastError || new Error('No resolved address accepted the connection'))
      const socket = connect({ host: address, port })
      socket.setTimeout(15_000)
      socket.once('connect', () => { socket.setTimeout(0); resolve(socket) })
      socket.once('timeout', () => socket.destroy(new Error(`Connection to ${address}:${port} timed out`)))
      socket.once('error', error => { lastError = error; attempt() })
    }
    attempt()
  })
}

async function startProxy(): Promise<ProxyState> {
  const resolverServers = configuredServers()
  const cache = new Map<string, CacheEntry>()
  const server = createServer((_request, response) => {
    response.writeHead(501, { 'content-type': 'text/plain' })
    response.end('Inkrail DNS proxy accepts HTTPS CONNECT requests only.')
  })
  const state = { server, url: '', port: 0, resolverServers, cache }
  server.on('connect', (request, client, head) => {
    client.on('error', () => undefined)
    const target = authority(request.url || '')
    void resolveHost(state, target.host).then(addresses => openSocket(addresses, target.port)).then(upstream => {
      upstream.on('error', () => client.destroy())
      client.on('close', () => upstream.destroy())
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: Inkrail\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    }).catch(error => {
      client.end(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${error instanceof Error ? error.message : String(error)}`)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Inkrail DNS proxy did not receive a TCP port')
  state.port = address.port
  state.url = `http://127.0.0.1:${address.port}`
  server.unref()
  return state
}

export async function scraperProxyUrl() {
  if (process.env.SCRAPER_DNS_ENABLED !== 'true') return null
  globalDns.inkrailScraperDns ||= startProxy()
  return (await globalDns.inkrailScraperDns).url
}

export async function scraperDnsStatus() {
  if (process.env.SCRAPER_DNS_ENABLED !== 'true') return { enabled: false, resolverServers: [], cacheEntries: 0, proxyPort: null }
  globalDns.inkrailScraperDns ||= startProxy()
  const state = await globalDns.inkrailScraperDns
  return { enabled: true, mode: 'cloudflare-doh', resolverServers: state.resolverServers, cacheEntries: state.cache.size, proxyPort: state.port }
}
