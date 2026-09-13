import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import { ExtensionManager, manifestSchema, fingerprint, signedIndex, unpackPackage } from '../extensions/runtime.mjs'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const key = fingerprint(publicKey)
function signed(value) { const payload = Buffer.from(JSON.stringify(value)); return { publicKey, payload: payload.toString('base64'), signature: sign(null, payload, keys.privateKey).toString('base64') } }
const manifest = version => manifestSchema.parse({ id: 'example', name: 'Example', version, protocol: 1, entry: 'index.mjs', mediaType: 'NOVEL', contentRating: 'SAFE', language: 'en', baseUrl: 'https://example.invalid', capabilities: ['search'], settings: [{ key: 'token', label: 'Token', type: 'secret' }, { key: 'quality', label: 'Quality', type: 'select', options: ['original', 'small'], default: 'original' }] })
const code = version => `export default { metadata: async ({id}) => ({sourceNovelId:id,titleOriginal:'Example'}), search: async (p,ctx) => { if(p.crash) process.exit(2); if(p.slow) await new Promise(r=>setTimeout(r,100)); return {version:'${version}',pid:process.pid, configured: !!ctx.config.token, hasOwnerSecret: !!process.env.OWNER_SESSION_SECRET} } }`

test('rejects tampered indexes, incompatible manifests, and unsafe package paths', () => {
 const index = signed({ name: 'Test', packages: [] })
 assert.equal(signedIndex(index, key).name, 'Test')
 assert.throws(() => signedIndex({ ...index, payload: Buffer.from('{}').toString('base64') }, key), /signature/)
 assert.throws(() => signedIndex(index, '0'.repeat(64)), /fingerprint/)
 assert.throws(() => manifestSchema.parse({ ...manifest('1.0.0'), protocol: 2 }))
 for (const path of ['../escape', '/absolute', 'C:/escape', 'a\\b', 'node_modules/x', 'CON.txt']) {
   // Nested normal files are permitted, but reserved module directory is not used here.
   if (path === 'node_modules/x') continue
   assert.throws(() => unpackPackage(Buffer.from(JSON.stringify({ manifest: manifest('1.0.0'), files: { 'index.mjs': code('1'), [path]: 'bad' } })), manifest('1.0.0')))
 }
})

test('install, runtime update, rollback, crash recovery, publisher pinning and restart persistence', async () => {
 await mkdir('work', { recursive: true }); const root = await mkdtemp(resolve('work', 'extensions-test-'))
 const assets = new Map(); let index
 const server = createServer((req,res) => { const value = req.url === '/index.json' ? Buffer.from(JSON.stringify(index)) : assets.get(req.url); if (!value) return res.writeHead(404).end(); res.end(value) })
 await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`
 const publish = (version, entry = code(version), hash) => { const m = manifest(version); const bytes = Buffer.from(JSON.stringify({ manifest: m, files: { 'index.mjs': entry } })); assets.set(`/${version}.json`, bytes); index = signed({ name: 'Test', packages: [{ manifest: m, url: `${base}/${version}.json`, sha256: hash || createHash('sha256').update(bytes).digest('hex') }] }) }
 let manager = new ExtensionManager(root)
 try {
  publish('1.0.0'); await manager.addRepository(`${base}/index.json`, key); await manager.install(key, 'example')
  const first = await manager.invoke('example', 'search'); assert.equal(first.version, '1.0.0'); assert.equal(first.hasOwnerSecret, false)
  assert.equal((await manager.invoke('example', 'search')).pid, first.pid)
  const pending = manager.invoke('example', 'search', { slow: true }); publish('1.1.0'); await manager.refreshRepository(key); await manager.install(key, 'example'); assert.equal((await pending).version, '1.0.0')
  assert.equal((await manager.invoke('example', 'search')).version, '1.1.0')
  await manager.action('example', 'rollback'); assert.equal((await manager.invoke('example', 'search')).version, '1.0.0')
  publish('1.2.0', 'throw new Error("broken update")'); await manager.refreshRepository(key); await assert.rejects(manager.install(key, 'example')); assert.equal((await manager.invoke('example', 'search')).version, '1.0.0')
  publish('1.3.0', code('bad'), '0'.repeat(64)); await manager.refreshRepository(key); await assert.rejects(manager.install(key, 'example'), /checksum/)
  assert.deepEqual((await manager.list()).installed[0].settings, { quality: 'original' })
  await manager.action('example', 'configure', { quality: 'small' }); assert.equal((await manager.list()).installed[0].settings.quality, 'small')
  await manager.action('example', 'configure', { token: 'test-secret' }); assert.equal((await manager.invoke('example', 'search')).configured, true); assert.equal(JSON.stringify(await manager.list()).includes('test-secret'), false)
  await assert.rejects(manager.invoke('example', 'search', { crash: true })); assert.equal((await manager.invoke('example', 'search')).version, '1.0.0')
  await manager.action('example', 'disable'); await assert.rejects(manager.invoke('example', 'search'), { code: 'SOURCE_UNAVAILABLE' })
  publish('1.4.0'); await manager.refreshRepository(key); await manager.install(key, 'example')
  assert.equal((await manager.list()).installed[0].enabled, false)
  await assert.rejects(manager.invoke('example', 'search'), { code: 'SOURCE_UNAVAILABLE' })
  await manager.action('example', 'enable'); manager.close(); manager = new ExtensionManager(root)
  assert.equal((await manager.invoke('example', 'search')).configured, true)
  assert.equal((await manager.list()).installed[0].settings.quality, 'small')
  assert.equal((await manager.list()).installed[0].settings.token, undefined)
  await manager.action('example', 'uninstall'); await assert.rejects(manager.invoke('example', 'search')); assert.equal((await manager.load()).owners.example, key)
 } finally { manager.close(); await new Promise(r => server.close(r)); await new Promise(r => setTimeout(r, 300)); await rm(root, { recursive: true, force: true }) }
})
