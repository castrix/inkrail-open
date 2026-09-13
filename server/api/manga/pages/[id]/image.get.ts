import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import prisma from '~/server/lib/prisma'
import { dataRoot } from '~/server/services/storage'

export default defineEventHandler(async (event) => {
  const page = await prisma.mangaPage.findUnique({ where: { id: getRouterParam(event, 'id')! }, select: { imagePath: true } })
  if (!page?.imagePath) throw createError({ statusCode: 404, statusMessage: 'Manga page has not been downloaded' })
  const root = dataRoot(), path = resolve(page.imagePath)
  if (!path.startsWith(root)) throw createError({ statusCode: 400, statusMessage: 'Invalid image path' })
  const extension = extname(path).toLowerCase()
  setHeader(event, 'content-type', extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.avif' ? 'image/avif' : extension === '.gif' ? 'image/gif' : 'image/jpeg')
  setHeader(event, 'cache-control', getQuery(event).v ? 'private, max-age=31536000, immutable' : 'private, no-cache')
  return readFile(path)
})
