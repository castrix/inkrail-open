import prisma from '../lib/prisma'
import { fetchSourceMetadata } from './sources'

type DownloadPage = { id: string, sourcePageId: string, sourceUrl: string, thumbnailUrl: string | null }

// Only the unfinished pages selected by this job are changed. Completed files stay intact.
export async function refreshSourceDownloadPages(source: string, galleryId: string, pages: DownloadPage[]) {
  const metadata = await fetchSourceMetadata(source, galleryId, { forceRefresh: true })
  const references = new Map(metadata.pages.map(page => [page.sourcePageId, page]))
  const updates = pages.map(page => {
    const reference = references.get(page.sourcePageId)
    if (!reference) throw new Error(`Source page ${page.sourcePageId} is missing from the current gallery manifest`)
    return { page, reference }
  })
  await prisma.$transaction(updates.map(({ page, reference }) => prisma.mangaPage.update({
    where: { id: page.id }, data: { sourceUrl: reference.sourceUrl, thumbnailUrl: reference.thumbnailUrl }
  })))
  for (const { page, reference } of updates) {
    page.sourceUrl = reference.sourceUrl
    page.thumbnailUrl = reference.thumbnailUrl || null
  }
}
