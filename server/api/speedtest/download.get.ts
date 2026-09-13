import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'

const MIN_BYTES = 64 * 1024
const MAX_BYTES = 64 * 1024 * 1024
const CHUNK_BYTES = 256 * 1024

export default defineEventHandler(async (event) => {
  const requested = Number(getQuery(event).bytes)
  const bytes = Math.min(MAX_BYTES, Math.max(MIN_BYTES, Number.isFinite(requested) ? Math.floor(requested) : MIN_BYTES))

  setHeader(event, 'content-type', 'application/octet-stream')
  setHeader(event, 'content-length', bytes)
  setHeader(event, 'content-encoding', 'identity')
  setHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate, no-transform')
  setHeader(event, 'x-content-type-options', 'nosniff')

  async function* chunks() {
    let remaining = bytes
    while (remaining > 0) {
      const size = Math.min(CHUNK_BYTES, remaining)
      yield randomBytes(size)
      remaining -= size
    }
  }

  return sendStream(event, Readable.from(chunks()))
})
