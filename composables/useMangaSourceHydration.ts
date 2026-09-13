import type { Ref } from 'vue'

const ACTIVE_DOWNLOAD_STATUSES = new Set(['PENDING', 'DOWNLOADING'])

export function useMangaSourceHydration(sourceSite: string, sourceNovelId: string, book: Ref<any>) {
  let poller: ReturnType<typeof setInterval> | undefined

  function hasActiveDownloads() {
    return Boolean(book.value?.pages?.some((page: any) => ACTIVE_DOWNLOAD_STATUSES.has(page.local?.downloadStatus)))
  }

  function stopDownloadPolling() {
    if (poller) clearInterval(poller)
    poller = undefined
  }

  async function hydrateLocal() {
    const state = await $fetch<any>(`/api/manga/local/${sourceSite}/${sourceNovelId}`)
    if (!book.value) return

    book.value.localNovel = state.localNovel
    const localPages = new Map(state.pages.map((page: any) => [page.sourcePageId, page]))
    book.value.pages = book.value.pages.map((page: any) => ({
      ...page,
      local: localPages.get(page.sourcePageId) || null
    }))

    if (!hasActiveDownloads()) stopDownloadPolling()
  }

  function applyLibraryResult(result: any) {
    if (!book.value || !result?.novel) return
    book.value.localNovel = {
      id: result.novel.id,
      slug: result.novel.slug,
      libraries: result.library ? [result.library] : (book.value.localNovel?.libraries || [])
    }
  }

  function startDownloadPolling() {
    if (poller || !hasActiveDownloads()) return
    poller = setInterval(() => void hydrateLocal().catch(() => undefined), 2_000)
  }

  onMounted(startDownloadPolling)
  onBeforeUnmount(stopDownloadPolling)

  return { applyLibraryResult, hydrateLocal, startDownloadPolling }
}
