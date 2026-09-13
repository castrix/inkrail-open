import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Novel, Chapter, MangaPage } from '@prisma/client'
import { slugify } from '~/server/utils/content'

export function dataRoot() {
  let configured = process.env.DATA_DIR || './data'
  try { configured = process.env.DATA_DIR || useRuntimeConfig().dataDir || configured } catch { /* Standalone worker process. */ }
  return resolve(process.cwd(), configured)
}

export function novelDirectory(novel: Pick<Novel, 'slug' | 'sourceSite' | 'sourceNovelId'>) {
  return resolve(dataRoot(), 'library', `${novel.slug}--${novel.sourceSite}-${createHash('sha256').update(novel.sourceNovelId).digest('hex').slice(0, 20)}`)
}

export function chapterDirectory(novel: Pick<Novel, 'slug' | 'sourceSite' | 'sourceNovelId'>, chapter: Pick<Chapter, 'position' | 'sourceChapterId'>) {
  return resolve(novelDirectory(novel), 'chapters', `${String(chapter.position).padStart(6, '0')}--${createHash('sha256').update(chapter.sourceChapterId).digest('hex').slice(0, 20)}`)
}

export function mangaPagePath(novel: Pick<Novel, 'slug' | 'sourceSite' | 'sourceNovelId'>, page: Pick<MangaPage, 'position' | 'sourceUrl'>) {
  const extension = page.sourceUrl.match(/\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i)?.[1]?.toLowerCase() || 'jpg'
  return resolve(novelDirectory(novel), 'pages', `${String(page.position).padStart(6, '0')}.${extension}`)
}

export function mangaCoverPath(novel: Pick<Novel, 'slug' | 'sourceSite' | 'sourceNovelId'>, sourceUrl: string) {
  const extension = sourceUrl.match(/\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i)?.[1]?.toLowerCase() || 'jpg'
  return resolve(novelDirectory(novel), `cover.${extension}`)
}

export function characterSkinPath(novel: Pick<Novel, 'slug' | 'sourceSite' | 'sourceNovelId'>, entryId: string, skinId: string, extension = 'png') {
  return resolve(novelDirectory(novel), 'characters', entryId, `${skinId}.${extension}`)
}

export async function writeAtomic(path: string, value: string | Buffer) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, value)
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function readUtf8(path: string) {
  return readFile(path, 'utf8')
}

export async function writeNovelMetadata(novel: Novel, chapterCount: number) {
  const directory = novelDirectory(novel)
  const metadata = {
    schemaVersion: 1,
    id: novel.id,
    title: novel.titleOriginal,
    translatedTitle: novel.titleTranslated,
    author: novel.author,
    category: novel.category,
    description: novel.description,
    status: novel.sourceStatus,
    wordCount: novel.wordCountLabel,
    sourceLanguage: novel.sourceLanguage,
    targetLanguage: novel.targetLanguage,
    source: { site: novel.sourceSite, novelId: novel.sourceNovelId, url: novel.sourceUrl, indexUrl: novel.indexUrl },
    chapterCount,
    sourceUpdatedAt: novel.sourceUpdatedAt,
    lastScrapedAt: novel.lastScrapedAt
  }
  await writeAtomic(resolve(directory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)
}

export function novelSlug(title: string) {
  return slugify(title)
}
