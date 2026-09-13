import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import prisma from '~/server/lib/prisma'

const contentTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const query = getQuery(event)
  const original = query.original === '1'
  const fullBody = query.view === 'full'
  const skin = await prisma.characterSkin.findUnique({ where: { id }, select: { introducedAtPosition: true, imagePath: true, optimizedPath: true, fullBodyPath: true, fullBodyOptimizedPath: true, profile: { select: { novel: { select: { readingProgress: { select: { chapter: { select: { position: true } } } } } } } } } })
  if (!skin?.imagePath) throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  if (skin.introducedAtPosition > (skin.profile.novel.readingProgress?.chapter.position || 0)) throw createError({ statusCode: 423, statusMessage: `Skin locked until chapter ${skin.introducedAtPosition}` })
  const path = fullBody
    ? (original ? skin.fullBodyPath : skin.fullBodyOptimizedPath || skin.fullBodyPath)
    : (original ? skin.imagePath : skin.optimizedPath || skin.imagePath)
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Full-body image not found' })
  try {
    const image = await readFile(path)
    setHeader(event, 'content-type', contentTypes[extname(path).toLowerCase()] || 'application/octet-stream')
    setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
    return image
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Image file is missing' })
  }
})
