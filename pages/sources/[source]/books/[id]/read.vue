<script setup lang="ts">
const route = useRoute()
const sourceSite = String(route.params.source), sourceNovelId = String(route.params.id)
const chapterId = computed(() => typeof route.query.chapter === 'string' && route.query.chapter !== 'all' ? route.query.chapter : undefined)
const query = computed(() => ({ sourceSite, sourceNovelId, chapter: typeof route.query.chapter === 'string' ? route.query.chapter : undefined }))
const { data: stream, error, refresh, status } = await useFetch<any>('/api/manga/stream', { query })
const chapters = computed(() => stream.value?.mangaChapters || [])
const chapterIndex = computed(() => chapters.value.findIndex((chapter: any) => chapter.sourceChapterId === chapterId.value))
const chapter = computed(() => chapters.value[chapterIndex.value])
const pages = computed(() => {
  if (!chapterId.value) return stream.value?.pages || []
  const ids = new Set(chapter.value?.sourcePageIds || [])
  return (stream.value?.pages || []).filter((page: any) => ids.has(page.sourcePageId))
})
const backTo = `/sources/${sourceSite}/books/${encodeURIComponent(sourceNovelId)}`
const chapterLink = (id: string) => ({ path: `${backTo}/read`, query: { chapter: id } })
function selectChapter(event: Event) {
  const select = event.target as HTMLSelectElement
  const id = select.value
  select.blur()
  return navigateTo(chapterLink(id || 'all'))
}
</script>

<template>
  <PageError v-if="error" :error="error" @retry="refresh()" />
  <p v-else-if="status === 'pending'" role="status" class="p-6 text-muted">Loading chapter…</p>
  <PageError v-else-if="chapterId && !chapter" :error="{ message: 'This chapter is unavailable. Return to the chapter list and choose another chapter.' }" :back-to="backTo" @retry="refresh()" />
  <MangaReader v-else-if="stream" :key="chapterId || 'all'" :title="chapter ? `${stream.titleOriginal} · ${chapter.titleOriginal}` : stream.titleOriginal" :pages="pages" :back-to="backTo" :default-mode="stream.defaultReaderMode || 'manga'" :source-site="sourceSite">
    <template v-if="chapters.length" #chapters>
      <nav aria-label="Chapter navigation" class="mb-2 flex items-center gap-2">
        <NuxtLink v-if="chapterIndex > 0" :to="chapterLink(chapters[chapterIndex - 1].sourceChapterId)" class="btn btn-quiet" aria-label="Previous chapter">←</NuxtLink>
        <select aria-label="Chapter" class="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#171916] p-3 text-sm" :value="chapterId || ''" @change="selectChapter">
          <option value="">All pages</option><option v-for="item in chapters" :key="item.sourceChapterId" :value="item.sourceChapterId">{{ item.titleOriginal }}</option>
        </select>
        <NuxtLink v-if="chapterIndex >= 0 && chapterIndex < chapters.length - 1" :to="chapterLink(chapters[chapterIndex + 1].sourceChapterId)" class="btn btn-quiet" aria-label="Next chapter">→</NuxtLink>
      </nav>
    </template>
  </MangaReader>
</template>
