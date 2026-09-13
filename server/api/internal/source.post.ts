import { invokeSource, sourceList } from '~/server/services/extensions'
export default defineEventHandler(async event => {
  const body = await readBody(event)
  try { return body.method === 'list' ? await sourceList() : await invokeSource(body.source, body.method, body.params) }
  catch (error: any) { throw createError({ statusCode: error.statusCode || 502, statusMessage: 'Source request failed', data: { message: error.message, code: error.code } }) }
})
