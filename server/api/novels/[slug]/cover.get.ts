import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import prisma from '~/server/lib/prisma'
import { dataRoot } from '~/server/services/storage'

export default defineEventHandler(async (event) => {
  const novel = await prisma.novel.findUnique({ where: { id: getRouterParam(event, 'slug')! }, select: { coverPath: true, coverUrl: true } })
  if (!novel?.coverPath) {
    if (novel?.coverUrl) return sendRedirect(event, novel.coverUrl, 302)
    throw createError({ statusCode: 404, statusMessage: 'Cover unavailable' })
  }
  const root = dataRoot()
  const path = resolve(novel.coverPath)
  if (!path.startsWith(root)) throw createError({ statusCode: 400, statusMessage: 'Invalid cover path' })
  const extension = extname(path).toLowerCase()
  setHeader(event, 'content-type', extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.avif' ? 'image/avif' : 'image/jpeg')
  setHeader(event, 'cache-control', 'private, max-age=3600')
  return readFile(path)
})
