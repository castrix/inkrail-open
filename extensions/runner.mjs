import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
// stdout is reserved for RPC frames. Extension logs go to stderr.
console.log = console.info = console.warn = (...args) => console.error(...args)
const { default: source } = await import(pathToFileURL(process.argv[2]).href)
if (!source || typeof source !== 'object' || typeof source.metadata !== 'function') throw new Error('Source must export metadata and capability methods')
const config = JSON.parse(process.env.INKRAIL_SOURCE_CONFIG || '{}')
const pending = new Map()
const input = createInterface({ input: process.stdin })
input.on('line', async line => {
  let request
  try {
    request = JSON.parse(line)
    if (request.method === '$cancel') { pending.get(request.params.id)?.abort(); return }
    const controller = new AbortController(); pending.set(request.id, controller)
    const fn = request.method === 'health' ? async () => { if (source.health) await source.health(); return { protocol: 1, methods: Object.keys(source) } } : source[request.method]
    if (typeof fn !== 'function') throw new Error('Unsupported operation')
    const result = await fn(request.params || {}, { config, signal: controller.signal, dataDir: process.env.DATA_DIR })
    process.stdout.write(JSON.stringify({ id: request.id, result }) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify({ id: request?.id, error: { message: error.message, code: error.code, statusCode: error.statusCode, data: error.data } }) + '\n')
  } finally { pending.delete(request?.id) }
})
input.on('close', () => process.exit(0))
