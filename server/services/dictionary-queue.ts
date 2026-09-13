import prisma from '../lib/prisma'
import type { Prisma } from '@prisma/client'

const DICTIONARY_DEPENDENTS = ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION']

export function dictionaryScanCurrent(chapter: { sourceHash: string | null, encyclopediaScan: { status: string, sourceHash: string, identityVersion: number } | null }, upgradeIdentity = false) {
  // The dictionary is a prerequisite derived from Chinese source, not translation output.
  return chapter.encyclopediaScan?.status === 'COMPLETED' && chapter.encyclopediaScan.sourceHash === chapter.sourceHash && (!upgradeIdentity || chapter.encyclopediaScan.identityVersion >= 2)
}

export async function queueEncyclopediaScans(novelId: string, chapterIds?: string[], options: { retryFailed?: boolean, upgradeIdentity?: boolean } = {}) {
  const chapters = await prisma.chapter.findMany({
    where: { novelId, kind: { not: 'ANNOUNCEMENT' }, scrapeStatus: 'COMPLETED', sourcePath: { not: null }, sourceHash: { not: null }, ...(chapterIds?.length ? { id: { in: chapterIds } } : {}) },
    include: { encyclopediaScan: true }, orderBy: { position: 'asc' }
  })
  let queued = 0
  for (const chapter of chapters) {
    if (dictionaryScanCurrent(chapter, options.upgradeIdentity)) continue
    // Automatic prerequisites must not repeatedly consume quota retrying failed scans.
    if (options.retryFailed === false && chapter.encyclopediaScan?.status === 'FAILED' && chapter.encyclopediaScan.sourceHash === chapter.sourceHash) continue
    const created = await prisma.$transaction(async tx => {
      const existing = await tx.scrapeJob.findFirst({ where: { type: 'EXTRACT_ENTITIES', payload: chapter.id, status: { in: ['PENDING', 'RUNNING', 'CANCEL_REQUESTED'] } } })
      if (existing) return false
      await tx.encyclopediaScan.upsert({
        where: { chapterId: chapter.id },
        create: { chapterId: chapter.id, sourceHash: chapter.sourceHash!, status: 'PENDING' },
        update: { sourceHash: chapter.sourceHash!, translationHash: null, status: 'PENDING', error: null }
      })
      await tx.scrapeJob.create({ data: { novelId, type: 'EXTRACT_ENTITIES', payload: chapter.id, total: 1, priority: 10 } })
      return true
    })
    if (created) queued++
  }
  return queued
}

export async function ensureNovelDictionaryReady(novelId: string, chapterIds?: string[]) {
  const chapters = await prisma.chapter.findMany({
    where: { novelId, ...(chapterIds?.length ? { id: { in: chapterIds } } : {}), kind: { not: 'ANNOUNCEMENT' }, scrapeStatus: 'COMPLETED', sourcePath: { not: null }, sourceHash: { not: null } },
    select: { sourceHash: true, encyclopediaScan: { select: { status: true, sourceHash: true, identityVersion: true } } }
  })
  const active = await prisma.scrapeJob.count({ where: { novelId, ...(chapterIds?.length ? { payload: { in: chapterIds } } : {}), type: 'EXTRACT_ENTITIES', status: { in: ['PENDING', 'RUNNING', 'CANCEL_REQUESTED'] } } })
  if (!active && chapters.every(chapter => dictionaryScanCurrent(chapter))) return true
  await queueEncyclopediaScans(novelId, chapterIds, { retryFailed: false })
  return false
}

export async function nextDictionaryReadyJob(scope: Prisma.ScrapeJobWhereInput) {
  const blockedNovels: string[] = []
  const scanning = await prisma.scrapeJob.findMany({ where: { type: 'EXTRACT_ENTITIES', status: { in: ['RUNNING', 'CANCEL_REQUESTED'] } }, select: { novelId: true }, distinct: ['novelId'] })
  const scanningNovels = scanning.map(job => job.novelId).filter((id): id is string => Boolean(id))
  while (true) {
    const candidate = await prisma.scrapeJob.findFirst({
      where: { AND: [scope, { status: 'PENDING' }, { NOT: { type: { in: DICTIONARY_DEPENDENTS }, novelId: { in: blockedNovels } } }, { NOT: { type: 'EXTRACT_ENTITIES', novelId: { in: scanningNovels } } }] },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
    })
    if (!candidate) return null
    if (!candidate.novelId || !DICTIONARY_DEPENDENTS.includes(candidate.type) || await ensureNovelDictionaryReady(candidate.novelId, candidate.payload ? [candidate.payload] : [])) return candidate
    blockedNovels.push(candidate.novelId)
    // Re-query after enqueueing prerequisites; other novels can still make progress.
  }
}
