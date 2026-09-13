const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  const declared = Number(getHeader(event, 'content-length') || 0)
  if (declared > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Speed-test upload is limited to 64 MB' })

  let received = 0
  for await (const chunk of event.node.req) {
    received += Buffer.byteLength(chunk)
    if (received > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Speed-test upload is limited to 64 MB' })
  }
  return { received }
})
