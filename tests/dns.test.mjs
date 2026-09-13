import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { request } from 'node:http'
import { scraperProxyUrl, scraperDnsStatus } from '../extensions/dns.mjs'

test('DNS override uses configured DoH, caches answers, fails closed, and can be disabled', async () => {
  const originalFetch = globalThis.fetch
  const originalEnabled = process.env.SCRAPER_DNS_ENABLED
  const originalServers = process.env.SCRAPER_DNS_SERVERS
  const echo = createServer(socket => socket.pipe(socket))
  await new Promise(resolve => echo.listen(0, '127.0.0.1', resolve))
  let queries = 0
  try {
    delete process.env.SCRAPER_DNS_ENABLED
    process.env.SCRAPER_DNS_SERVERS = '1.1.1.1,1.0.0.1'
    globalThis.fetch = async (url, options) => {
      queries++
      assert.equal(options.headers.accept, 'application/dns-json')
      assert.match(url, /^https:\/\/1\.(1\.1\.1|0\.0\.1)\/dns-query/)
      if (url.includes('missing.test')) throw new Error('resolver unavailable')
      return Response.json({ Status: 0, Answer: [{ type: 1, TTL: 60, data: '127.0.0.1' }] })
    }
    const proxy = new URL(await scraperProxyUrl())
    const tunnel = host => new Promise((resolve, reject) => {
      const req = request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: `${host}:${echo.address().port}` })
      req.on('connect', (res, socket) => {
        if (res.statusCode !== 200) { socket.destroy(); resolve(res.statusCode); return }
        socket.once('data', data => { socket.destroy(); resolve(data.toString()) })
        socket.on('error', reject)
        socket.write('echo through override')
      })
      req.on('error', reject); req.end()
    })
    assert.equal(await tunnel('source.test'), 'echo through override')
    assert.equal(await tunnel('source.test'), 'echo through override')
    assert.equal(queries, 1)
    assert.equal(await tunnel('missing.test'), 502)
    assert.equal(queries, 3)
    assert.equal((await scraperDnsStatus()).enabled, true)
    process.env.SCRAPER_DNS_ENABLED = 'false'
    assert.equal(await scraperProxyUrl(), null)
    assert.equal((await scraperDnsStatus()).enabled, false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalEnabled === undefined) delete process.env.SCRAPER_DNS_ENABLED; else process.env.SCRAPER_DNS_ENABLED = originalEnabled
    if (originalServers === undefined) delete process.env.SCRAPER_DNS_SERVERS; else process.env.SCRAPER_DNS_SERVERS = originalServers
    const state = await globalThis.inkrailScraperDns
    state?.server.closeAllConnections()
    await new Promise(resolve => state.server.close(resolve))
    delete globalThis.inkrailScraperDns
    await new Promise(resolve => echo.close(resolve))
  }
})
