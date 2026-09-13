import { resolve } from 'node:path'
import prisma from '~/server/lib/prisma'
import { chapterMarkdown, sha256 } from '~/server/utils/content'
import { invokeSource, sourceAsset, sourceManifest } from './extensions'
import { z } from 'zod'
import type { NovelMetadata } from '~/shared/scraper/types'
import { chapterDirectory, mangaCoverPath, mangaPagePath, novelSlug, writeAtomic, writeNovelMetadata } from './storage'

import { putNovelInSourceLibrary } from './libraries'
import { fetchSourceMetadata, fetchSourceDirectory, fetchHentaiNexusMetadata, fetchHitomiMetadata, fetchNhentaiMetadata, fetchTwkanDirectory, fetchTwkanMetadata } from './sources'
import { queueNovelTranslations } from './translation'
import type { MangaMetadata } from '~/shared/scraper/types'
import { refreshSourceDownloadPages } from './source-download'
import { paceDownload } from './download-settings'

async function upsertTwkanNovel(input: NovelMetadata) {
  const { pages, tags, language, publisher, favoriteCount, ...metadata } = input as MangaMetadata
  const manifest = await sourceManifest(metadata.sourceSite)
  const existing = await prisma.novel.findUnique({ where: { sourceSite_sourceNovelId: { sourceSite: metadata.sourceSite, sourceNovelId: metadata.sourceNovelId } } })
  if (existing) return prisma.novel.update({ where: { id: existing.id }, data: metadata })
  const baseSlug = novelSlug(metadata.titleOriginal)
  const collision = await prisma.novel.findUnique({ where: { slug: baseSlug }, select: { id: true } })
  return prisma.novel.create({ data: { ...metadata, sourceLanguage: manifest.sourceLanguage, targetLanguage: process.env.TRANSLATION_TARGET_LANGUAGE || 'English', slug: collision ? `${baseSlug}-${metadata.sourceNovelId}` : baseSlug } })
}

async function upsertAdultManga(metadata: MangaMetadata) {
  const { pages: _pages, publisher: _publisher, tags, language, favoriteCount: _favoriteCount, ...base } = metadata
  const manifest = await sourceManifest(metadata.sourceSite)
  const data = { ...base, mediaType: 'MANGA', contentRating: manifest.contentRating, sourceLanguage: language || 'unknown', targetLanguage: 'none', tagsJson: JSON.stringify(tags) }
  const existing = await prisma.novel.findUnique({ where: { sourceSite_sourceNovelId: { sourceSite: metadata.sourceSite, sourceNovelId: metadata.sourceNovelId } } })
  if (existing) return prisma.novel.update({ where: { id: existing.id }, data })
  const baseSlug = novelSlug(metadata.titleOriginal)
  const collision = await prisma.novel.findUnique({ where: { slug: baseSlug }, select: { id: true } })
  return prisma.novel.create({ data: { ...data, slug: collision ? `${baseSlug}-${metadata.sourceNovelId}` : baseSlug } })
}

export async function cacheMangaCover(novel: Awaited<ReturnType<typeof upsertAdultManga>>, metadata: MangaMetadata, force = false) {
  novel = await prisma.novel.update({ where: { id: novel.id }, data: { tagsJson: JSON.stringify(metadata.tags), sourceLanguage: metadata.language || 'unknown' } })
  if (novel.coverPath && !force) return novel
  const firstPage = metadata.pages[0]
  const candidates = [...new Set([firstPage?.sourceUrl, metadata.coverUrl, firstPage?.thumbnailUrl].filter((value): value is string => Boolean(value)))]
  if (!candidates.length) return novel
  const headers = { referer: metadata.sourceUrl, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
  let lastError: unknown
  for (const sourceUrl of candidates) {
    try {
      const binary = await sourceAsset(novel.sourceSite, sourceUrl, headers.referer)
      const coverPath = mangaCoverPath(novel, sourceUrl)
      await writeAtomic(coverPath, binary)
      return prisma.novel.update({ where: { id: novel.id }, data: { coverPath } })
    } catch (error) { lastError = error }
  }
  console.warn(`[manga cover] ${metadata.sourceSite}/${metadata.sourceNovelId}: ${lastError instanceof Error ? lastError.message : 'Could not cache cover'}`)
  return novel
}

function needsHentaiNexusCoverRepair(novel: Awaited<ReturnType<typeof upsertAdultManga>>, metadata: MangaMetadata) {
  return false
}

async function bookmarkAdultManga(metadata: MangaMetadata, libraryId?: string) {
  const novel = await upsertAdultManga(metadata)
  const library = await putNovelInSourceLibrary(novel.id, metadata.sourceSite, libraryId)
  if (!novel.coverPath || needsHentaiNexusCoverRepair(novel, metadata)) void cacheMangaCover(novel, metadata, needsHentaiNexusCoverRepair(novel, metadata))
    .catch(error => console.warn(`[manga cover] background cache failed: ${error instanceof Error ? error.message : String(error)}`))
  return { novel, library }
}

export async function bookmarkTwkanNovel(sourceNovelId: string, libraryId?: string) {
  const metadata = await fetchTwkanMetadata(sourceNovelId)
  const novel = await upsertTwkanNovel(metadata)
  const library = await putNovelInSourceLibrary(novel.id, 'twkan', libraryId)
  return { novel, library }
}

export async function bookmarkHentaiNexusGallery(sourceNovelId: string, libraryId?: string) {
  const metadata = await fetchHentaiNexusMetadata(sourceNovelId)
  return bookmarkAdultManga(metadata, libraryId)
}

export async function bookmarkNhentaiGallery(sourceNovelId: string, libraryId?: string) {
  const metadata = await fetchNhentaiMetadata(sourceNovelId)
  return bookmarkAdultManga(metadata, libraryId)
}

export async function bookmarkHitomiGallery(sourceNovelId: string, libraryId?: string) {
  const metadata = await fetchHitomiMetadata(sourceNovelId)
  return bookmarkAdultManga(metadata, libraryId)
}

export async function syncSourceDirectory(source: string, sourceNovelId: string, options: { translateNewChapters?: boolean } = {}) {
  const metadata = await fetchSourceMetadata(source, sourceNovelId)
  const novel = await upsertTwkanNovel(metadata)
  const { parsed, transport } = await fetchSourceDirectory(source, sourceNovelId)
  const existing = new Set((await prisma.chapter.findMany({
    where: { novelId: novel.id },
    select: { sourceChapterId: true }
  })).map(chapter => chapter.sourceChapterId))

  const chapters = await prisma.$transaction(parsed.chapters.map(chapter => prisma.chapter.upsert({
    where: { novelId_sourceChapterId: { novelId: novel.id, sourceChapterId: chapter.sourceChapterId } },
    create: { novelId: novel.id, ...chapter, scrapeStatus: 'NOT_DOWNLOADED' },
    update: { sourceUrl: chapter.sourceUrl, position: chapter.position, titleOriginal: chapter.titleOriginal, kind: chapter.kind }
  })))
  const addedSourceIds = new Set(parsed.chapters.filter(chapter => !existing.has(chapter.sourceChapterId)).map(chapter => chapter.sourceChapterId))
  const addedChapters = chapters.filter(chapter => addedSourceIds.has(chapter.sourceChapterId) && chapter.scrapeStatus !== 'COMPLETED')
  const activeJobs = await prisma.scrapeJob.findMany({
    where: { novelId: novel.id, type: 'SCRAPE_CHAPTERS', status: { in: ['PENDING', 'RUNNING', 'WAITING_FOR_ACCESS'] } },
    select: { payload: true }
  })
  const legacyBulkActive = activeJobs.some(job => payloadChapterIds(job.payload) === null)
  const activeIds = new Set(activeJobs.flatMap(job => payloadChapterIds(job.payload) || []))
  const queued = legacyBulkActive ? [] : addedChapters.filter(chapter => !activeIds.has(chapter.id))
  const job = queued.length ? await prisma.$transaction(async transaction => {
    const chapterIds = queued.map(chapter => chapter.id)
    await transaction.chapter.updateMany({ where: { id: { in: chapterIds } }, data: { scrapeStatus: 'PENDING', scrapeError: null } })
    return transaction.scrapeJob.create({ data: {
      novelId: novel.id, type: 'SCRAPE_CHAPTERS', total: queued.length,
      payload: JSON.stringify({ chapterIds, translateAfterDownload: options.translateNewChapters === true })
    } })
  }) : null
  await writeNovelMetadata(novel, parsed.chapters.length)
  return {
    novelId: novel.id,
    total: parsed.chapters.length,
    added: addedSourceIds.size,
    queued: queued.length,
    job,
    transport,
    syncedAt: new Date()
  }
}

function payloadChapterIds(payload: string | null) {
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload)
    return Array.isArray(parsed.chapterIds) ? parsed.chapterIds.filter((id: unknown): id is string => typeof id === 'string') : null
  } catch { return null }
}

function shouldTranslateAfterDownload(payload: string | null) {
  if (!payload) return false
  try {
    return JSON.parse(payload).translateAfterDownload === true
  } catch { return false }
}

export async function queueNovelDownload(source: string, sourceNovelId: string, sourceChapterIds?: string[]) {
  const metadata = await fetchSourceMetadata(source, sourceNovelId)
  const novel = await upsertTwkanNovel(metadata)
  if (!(await prisma.libraryNovel.findFirst({ where: { novelId: novel.id } }))) {
    await putNovelInSourceLibrary(novel.id, source)
  }
  const { parsed, transport } = await fetchSourceDirectory(source, sourceNovelId)
  const requested = sourceChapterIds?.length ? new Set(sourceChapterIds) : null
  const references = parsed.chapters.filter(chapter => !requested || requested.has(chapter.sourceChapterId))
  if (requested && references.length !== requested.size) throw createError({ statusCode: 404, statusMessage: 'One or more TWKAN chapters were not found' })

  const chapters = await prisma.$transaction(references.map(chapter => prisma.chapter.upsert({
    where: { novelId_sourceChapterId: { novelId: novel.id, sourceChapterId: chapter.sourceChapterId } },
    create: { novelId: novel.id, ...chapter },
    update: { sourceUrl: chapter.sourceUrl, position: chapter.position, titleOriginal: chapter.titleOriginal, kind: chapter.kind }
  })))
  const candidates = chapters.filter(chapter => chapter.scrapeStatus !== 'COMPLETED')
  const activeJobs = await prisma.scrapeJob.findMany({ where: { novelId: novel.id, type: 'SCRAPE_CHAPTERS', status: { in: ['PENDING', 'RUNNING', 'WAITING_FOR_ACCESS'] } }, select: { payload: true } })
  const legacyBulkActive = activeJobs.some(job => payloadChapterIds(job.payload) === null)
  const activeIds = new Set(activeJobs.flatMap(job => payloadChapterIds(job.payload) || []))
  const queued = legacyBulkActive ? [] : candidates.filter(chapter => !activeIds.has(chapter.id))
  const job = queued.length ? await prisma.$transaction(async transaction => {
    const chapterIds = queued.map(chapter => chapter.id)
    await transaction.chapter.updateMany({ where: { id: { in: chapterIds } }, data: { scrapeStatus: 'PENDING', scrapeError: null } })
    return transaction.scrapeJob.create({ data: {
      novelId: novel.id,
      type: 'SCRAPE_CHAPTERS',
      total: queued.length,
      payload: JSON.stringify({ chapterIds })
    } })
  }) : null
  const queuedIds = new Set(queued.map(chapter => chapter.id))
  await writeNovelMetadata(novel, await prisma.chapter.count({ where: { novelId: novel.id } }))
  return {
    novel, job, queued: queued.length, indexed: chapters.length, directoryCount: parsed.chapters.length, transport,
    chapters: chapters.map(chapter => ({ id: chapter.id, sourceChapterId: chapter.sourceChapterId, scrapeStatus: queuedIds.has(chapter.id) ? 'PENDING' : chapter.scrapeStatus }))
  }
}

export async function importTwkanNovel(inputUrl: string) {
  const { id: sourceNovelId } = await invokeSource('twkan', 'resolve', { url: inputUrl })
  const bookmarked = await bookmarkTwkanNovel(sourceNovelId)
  const download = await queueTwkanDownload(sourceNovelId)
  return { novel: bookmarked.novel, chapterCount: download.directoryCount, job: download.job, transport: { index: download.transport } }
}

export async function queueHentaiNexusDownload(sourceNovelId: string, sourcePageIds?: string[], libraryId?: string) {
  const metadata = await fetchHentaiNexusMetadata(sourceNovelId)
  return queueAdultMangaDownload(metadata, sourcePageIds, libraryId)
}

export async function queueNhentaiDownload(sourceNovelId: string, sourcePageIds?: string[], libraryId?: string) {
  const metadata = await fetchNhentaiMetadata(sourceNovelId)
  return queueAdultMangaDownload(metadata, sourcePageIds, libraryId)
}

export async function queueHitomiDownload(sourceNovelId: string, sourcePageIds?: string[], libraryId?: string) {
  const metadata = await fetchHitomiMetadata(sourceNovelId)
  return queueAdultMangaDownload(metadata, sourcePageIds, libraryId)
}

async function queueAdultMangaDownload(metadata: MangaMetadata, sourcePageIds?: string[], libraryId?: string) {
  const novel = await upsertAdultManga(metadata)
  const existingEntry = await prisma.libraryNovel.findFirst({ where: { novelId: novel.id } })
  const library = libraryId
    ? await putNovelInSourceLibrary(novel.id, metadata.sourceSite, libraryId)
    : existingEntry ? null : await putNovelInSourceLibrary(novel.id, metadata.sourceSite)
  if (!novel.coverPath || needsHentaiNexusCoverRepair(novel, metadata)) void cacheMangaCover(novel, metadata, needsHentaiNexusCoverRepair(novel, metadata))
    .catch(error => console.warn(`[manga cover] background cache failed: ${error instanceof Error ? error.message : String(error)}`))
  const requested = sourcePageIds?.length ? new Set(sourcePageIds) : null
  const references = metadata.pages.filter(page => !requested || requested.has(page.sourcePageId))
  if (requested && references.length !== requested.size) throw createError({ statusCode: 404, statusMessage: 'One or more manga pages were not found' })
  const existingPages = new Map((await prisma.mangaPage.findMany({
    where: { novelId: novel.id, sourcePageId: { in: references.map(page => page.sourcePageId) } },
    select: { sourcePageId: true, sourceUrl: true, downloadStatus: true }
  })).map(page => [page.sourcePageId, page]))
  const repairedIds = new Set(references.filter(page => {
    const existing = existingPages.get(page.sourcePageId)
    return existing && existing.downloadStatus !== 'COMPLETED' && existing.sourceUrl !== page.sourceUrl
  }).map(page => page.sourcePageId))
  const pages = await prisma.$transaction(references.map(page => prisma.mangaPage.upsert({
    where: { novelId_sourcePageId: { novelId: novel.id, sourcePageId: page.sourcePageId } },
    create: { novelId: novel.id, ...page },
    update: {
      sourceUrl: page.sourceUrl, thumbnailUrl: page.thumbnailUrl, position: page.position,
      ...(repairedIds.has(page.sourcePageId) ? { downloadStatus: 'PENDING', error: null } : {})
    }
  })))
  const candidates = pages.filter(page => page.downloadStatus !== 'COMPLETED')
  const activeJobs = await prisma.scrapeJob.findMany({ where: { novelId: novel.id, type: 'DOWNLOAD_MANGA', status: { in: ['PENDING', 'RUNNING'] } }, select: { payload: true } })
  const activeIds = new Set(activeJobs.flatMap(job => payloadChapterIds(job.payload) || []))
  const queued = candidates.filter(page => !activeIds.has(page.id))
  const job = queued.length ? await prisma.$transaction(async transaction => {
    const pageIds = queued.map(page => page.id)
    await transaction.mangaPage.updateMany({
      where: { id: { in: pageIds } },
      data: { downloadStatus: 'PENDING', error: null }
    })
    return transaction.scrapeJob.create({ data: {
      novelId: novel.id, type: 'DOWNLOAD_MANGA', total: queued.length,
      payload: JSON.stringify({ chapterIds: pageIds })
    } })
  }) : null
  return { novel, library, job, queued: queued.length, repaired: repairedIds.size, indexed: pages.length, pageCount: metadata.pages.length }
}

export async function processMangaDownloadJob(jobId: string) {
  const job = await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, error: null } })
  if (!job.novelId) throw new Error('Manga download job has no gallery')
  let novel = await prisma.novel.findUniqueOrThrow({ where: { id: job.novelId } })
  const selectedIds = payloadChapterIds(job.payload) || []
  const pages = await prisma.mangaPage.findMany({ where: { id: { in: selectedIds }, downloadStatus: { not: 'COMPLETED' } }, orderBy: { position: 'asc' } })
  let progress = await prisma.mangaPage.count({ where: { id: { in: selectedIds }, downloadStatus: 'COMPLETED' } })
  try {
    let lastHitomiRefresh = 0
    if (pages.length) {
      await refreshSourceDownloadPages(novel.sourceSite, novel.sourceNovelId, pages)
      lastHitomiRefresh = Date.now()
    }
    for (const page of pages) {
      try {
        // Long-running jobs may outlive Hitomi's current image routing generation.
        if (Date.now() - lastHitomiRefresh > 5 * 60_000) {
          await refreshSourceDownloadPages(novel.sourceSite, novel.sourceNovelId, pages.slice(pages.indexOf(page)))
          lastHitomiRefresh = Date.now()
        }
        await prisma.mangaPage.update({ where: { id: page.id }, data: { downloadStatus: 'DOWNLOADING', error: null } })
        const headers = { referer: novel.sourceUrl, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
        let binary: Buffer
        try { binary = await sourceAsset(novel.sourceSite, page.sourceUrl, headers.referer) }
        catch (error) {
          if (!/HTTP 404/.test(error instanceof Error ? error.message : '') || Date.now() - lastHitomiRefresh < 60_000) throw error
          await refreshSourceDownloadPages(novel.sourceSite, novel.sourceNovelId, pages.slice(pages.indexOf(page)))
          lastHitomiRefresh = Date.now()
          binary = await sourceAsset(novel.sourceSite, page.sourceUrl, headers.referer)
        }
        const imagePath = mangaPagePath(novel, page)
        await writeAtomic(imagePath, binary)
        if (!novel.coverPath) novel = await prisma.novel.update({ where: { id: novel.id }, data: { coverPath: imagePath } })
        await prisma.mangaPage.update({ where: { id: page.id }, data: { imagePath, downloadStatus: 'COMPLETED', downloadedAt: new Date(), error: null } })
      } catch (error) {
        if ((error as any)?.code === 'SOURCE_UNAVAILABLE') { await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'PAUSED', error: (error as Error).message } }); return }
        await prisma.mangaPage.update({ where: { id: page.id }, data: { downloadStatus: 'FAILED', error: error instanceof Error ? error.message : String(error) } })
      }
      progress += 1
      await prisma.scrapeJob.update({ where: { id: job.id }, data: { progress } })
      await paceDownload(novel.sourceSite, 350)
    }
    const failed = await prisma.mangaPage.count({ where: { id: { in: selectedIds }, downloadStatus: 'FAILED' } })
    await prisma.$transaction([
      prisma.scrapeJob.update({ where: { id: job.id }, data: { status: failed ? 'PARTIAL' : 'COMPLETED', completedAt: new Date(), error: failed ? `${failed} pages failed` : null } }),
      prisma.novel.update({ where: { id: novel.id }, data: { lastScrapedAt: new Date() } })
    ])
  } catch (error) {
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: (error as any)?.code === 'SOURCE_UNAVAILABLE' ? 'PAUSED' : 'FAILED', error: error instanceof Error ? error.message : String(error), completedAt: (error as any)?.code === 'SOURCE_UNAVAILABLE' ? null : new Date() } })
    throw error
  }
}

function delay(ms: number) { return new Promise(resolveDelay => setTimeout(resolveDelay, ms)) }

export async function processScrapeJob(jobId: string) {
  const job = await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, error: null } })
  if (!job.novelId) throw new Error('Scrape job has no novel')
  const novel = await prisma.novel.findUniqueOrThrow({ where: { id: job.novelId } })
  const selectedIds = payloadChapterIds(job.payload)
  const chapters = await prisma.chapter.findMany({ where: {
    novelId: novel.id,
    scrapeStatus: { in: ['PENDING', 'FAILED', 'DOWNLOADING'] },
    ...(selectedIds ? { id: { in: selectedIds } } : {})
  }, orderBy: { position: 'asc' } })
  let progress = selectedIds
    ? await prisma.chapter.count({ where: { id: { in: selectedIds }, scrapeStatus: 'COMPLETED' } })
    : job.progress
  if (progress !== job.progress) await prisma.scrapeJob.update({ where: { id: job.id }, data: { progress } })
  try {
    for (const chapter of chapters) {
      try {
        await prisma.chapter.update({ where: { id: chapter.id }, data: { scrapeStatus: 'DOWNLOADING', scrapeError: null } })
        const parsed = z.object({ titleOriginal: z.string().min(1), paragraphs: z.array(z.string()).min(1), publishedAt: z.coerce.date().nullable() }).parse(await invokeSource(novel.sourceSite, 'chapter', { id: chapter.sourceChapterId, url: chapter.sourceUrl, bookId: novel.sourceNovelId }))
        const markdown = chapterMarkdown(parsed.titleOriginal, parsed.paragraphs)
        const sourceHash = sha256(markdown)
        const sourcePath = resolve(chapterDirectory(novel, chapter), 'source.md')
        await writeAtomic(sourcePath, markdown)
        const currentTranslation = await prisma.translation.findUnique({ where: { chapterId_targetLanguage: { chapterId: chapter.id, targetLanguage: novel.targetLanguage } } })
        const translationStatus = chapter.kind === 'ANNOUNCEMENT'
          ? 'SKIPPED'
          : currentTranslation?.status === 'SKIPPED'
            ? 'NOT_STARTED'
            : currentTranslation?.sourceHash && currentTranslation.sourceHash !== sourceHash
              ? 'SOURCE_CHANGED'
              : currentTranslation?.status || 'NOT_STARTED'
        await prisma.$transaction([
          prisma.chapter.update({ where: { id: chapter.id }, data: { titleOriginal: parsed.titleOriginal, sourcePath, sourceHash, sourcePublishedAt: parsed.publishedAt, scrapeStatus: 'COMPLETED', scrapeError: null, scrapedAt: new Date() } }),
          prisma.translation.upsert({ where: { chapterId_targetLanguage: { chapterId: chapter.id, targetLanguage: novel.targetLanguage } }, create: { chapterId: chapter.id, targetLanguage: novel.targetLanguage, status: translationStatus }, update: { status: translationStatus } })
        ])
      } catch (error) {
        if ((error as any)?.code === 'SOURCE_UNAVAILABLE') {
          await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'PAUSED', error: (error as Error).message } }); return
        }
        if (error instanceof Error && error.message === 'WAITING_FOR_ACCESS') {
          await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'WAITING_FOR_ACCESS', progress, error: 'Source requires manual browser verification.' } })
          return
        }
        await prisma.chapter.update({ where: { id: chapter.id }, data: { scrapeStatus: 'FAILED', scrapeError: error instanceof Error ? error.message : String(error) } })
      }
      progress += 1
      await prisma.scrapeJob.update({ where: { id: job.id }, data: { progress } })
      await paceDownload(novel.sourceSite, 2500 + Math.floor(Math.random() * 2000))
    }
    const failed = await prisma.chapter.count({ where: { novelId: novel.id, scrapeStatus: 'FAILED', ...(selectedIds ? { id: { in: selectedIds } } : {}) } })
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: failed ? 'PARTIAL' : 'COMPLETED', completedAt: new Date(), error: failed ? `${failed} chapters failed` : null } })
    if (shouldTranslateAfterDownload(job.payload) && selectedIds?.length) {
      await queueNovelTranslations(novel.id, selectedIds)
    }
    const updatedNovel = await prisma.novel.update({ where: { id: novel.id }, data: { lastScrapedAt: new Date() } })
    await writeNovelMetadata(updatedNovel, await prisma.chapter.count({ where: { novelId: novel.id } }))
  } catch (error) {
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: (error as any)?.code === 'SOURCE_UNAVAILABLE' ? 'PAUSED' : 'FAILED', error: error instanceof Error ? error.message : String(error), completedAt: (error as any)?.code === 'SOURCE_UNAVAILABLE' ? null : new Date() } })
    throw error
  }
}

export const syncTwkanDirectory = (id: string, options = {}) => syncSourceDirectory('twkan', id, options)
export const queueTwkanDownload = (id: string, chapters?: string[]) => queueNovelDownload('twkan', id, chapters)
export async function bookmarkSource(source: string, id: string, libraryId?: string) {
  const manifest = await sourceManifest(source)
  const metadata = await fetchSourceMetadata(source, id)
  if (manifest.mediaType === 'MANGA') return bookmarkAdultManga(metadata, libraryId)
  const novel = await upsertTwkanNovel(metadata)
  return { novel, library: await putNovelInSourceLibrary(novel.id, source, libraryId) }
}
export async function queueSourceDownload(source: string, id: string, ids?: string[], libraryId?: string) {
  const manifest = await sourceManifest(source)
  return manifest.mediaType === 'MANGA' ? queueAdultMangaDownload(await fetchSourceMetadata(source, id), ids, libraryId) : queueNovelDownload(source, id, ids)
}
