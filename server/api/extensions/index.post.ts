import { z } from 'zod'
import { extensionManager } from '~/server/services/extensions'
import prisma from '~/server/lib/prisma'
export default defineEventHandler(async event => {
  const body = z.object({ action: z.enum(['addRepository', 'refreshRepository', 'removeRepository', 'install', 'enable', 'disable', 'uninstall', 'rollback', 'restart', 'configure']), source: z.string().optional(), fingerprint: z.string().optional(), url: z.string().optional(), config: z.record(z.string(), z.string()).optional() }).parse(await readBody(event))
  const manager = extensionManager()
  try {
    if (body.action === 'addRepository') await manager.addRepository(body.url || '', body.fingerprint || '')
    else if (body.action === 'refreshRepository') await manager.refreshRepository(body.fingerprint || '')
    else if (body.action === 'removeRepository') await manager.removeRepository(body.fingerprint || '')
    else if (body.action === 'install') await manager.install(body.fingerprint || '', body.source || '')
    else await manager.action(body.source || '', body.action, body.config)
    if (body.source && ['install', 'enable', 'rollback'].includes(body.action) && (await manager.sources()).some((source: any) => source.id === body.source)) await prisma.scrapeJob.updateMany({ where: { status: 'PAUSED', type: { in: ['SCRAPE_CHAPTERS', 'DOWNLOAD_MANGA'] }, novel: { is: { sourceSite: body.source } } }, data: { status: 'PENDING', error: null } })
    return { ok: true }
  } catch (error: any) { throw createError({ statusCode: 400, statusMessage: 'Extension operation failed', data: { message: error.message } }) }
})
