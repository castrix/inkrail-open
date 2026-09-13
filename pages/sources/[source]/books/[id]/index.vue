<script setup lang="ts">
const route = useRoute(), source = String(route.params.source), id = String(route.params.id)
const { data: book, error, refresh } = await useFetch<any>(`/api/sources/${source}/books/${encodeURIComponent(id)}`)
useHead({ title: () => `${book.value?.titleOriginal || 'Source book'} — Inkrail` })
const busy = ref(false), message = ref('')
async function action(download = false, sourcePageIds?: string[]) {
  busy.value = true; message.value = ''
  try { const result: any = await $fetch(download ? `/api/downloads/${source}` : '/api/library/bookmark', { method: 'POST', body: { sourceSite: source, sourceNovelId: id, sourcePageIds } }); message.value = download ? `Queued ${result.queued} ${book.value?.mediaType === 'MANGA' ? 'pages' : 'chapters'}.` : 'Added to library.'; await refresh() }
  catch (cause: any) { message.value = cause.data?.data?.message || cause.data?.statusMessage || 'This operation failed. Check the source and retry.' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="mx-auto max-w-4xl px-5 py-10">
    <NuxtLink :to="`/sources/${source}`" class="text-sm text-gold">← Browse source</NuxtLink>
    <PageError v-if="error" :error="error" :back-to="`/sources/${source}`" @retry="refresh()" />
    <template v-if="book">
      <BookCover v-if="book.coverUrl" :src="`/api/sources/${source}/cover/${encodeURIComponent(id)}`" :title="book.titleOriginal" class="mt-6 aspect-[3/4] w-32 rounded-xl" /><h1 class="mt-6 font-serif text-3xl sm:text-4xl">{{ book.titleOriginal }}</h1>
      <p class="mt-3 text-muted">{{ book.author || 'Unknown creator' }} · {{ book.mediaType === 'MANGA' ? 'Manga' : 'Novel' }}</p>
      <p class="mt-5 whitespace-pre-line leading-relaxed text-white/65">{{ book.description }}</p>
      <div class="my-7 flex flex-wrap gap-3"><button v-if="!book.localNovel" class="btn btn-primary" :disabled="busy" @click="action()">Add to library</button><button class="btn btn-quiet" :disabled="busy" @click="action(true)">Download</button><NuxtLink v-if="book.localNovel" class="btn btn-quiet" :to="`/${book.mediaType === 'MANGA' ? 'manga' : 'novels'}/${book.localNovel.slug}`">Open library copy</NuxtLink><NuxtLink v-if="book.mediaType === 'MANGA'" class="btn btn-quiet" :to="`/sources/${source}/books/${encodeURIComponent(id)}/read`">Read online</NuxtLink></div>
      <p v-if="message" role="status" class="mb-5 text-gold">{{ message }}</p>
      <section v-if="book.mediaType === 'MANGA' && book.mangaChapters?.length" class="mb-8" aria-label="Manga chapters">
        <h2 class="text-xl">{{ book.mangaChapters.length }} chapters</h2>
        <ul class="surface mt-5 divide-y divide-white/10 rounded-xl">
          <li v-for="chapter in book.mangaChapters" :key="chapter.sourceChapterId" class="flex flex-wrap items-center justify-between gap-3 p-4">
            <NuxtLink class="min-w-0 flex-1 break-words py-2 text-gold" :to="{ path: `/sources/${source}/books/${encodeURIComponent(id)}/read`, query: { chapter: chapter.sourceChapterId } }">{{ chapter.titleOriginal }}<span class="mt-1 block text-sm text-muted">{{ chapter.sourcePageIds.length }} pages</span></NuxtLink>
            <button class="btn btn-quiet" :disabled="busy" :aria-label="`Download ${chapter.titleOriginal}`" @click="action(true, chapter.sourcePageIds)">Download</button>
          </li>
        </ul>
      </section>
      <h2 class="text-xl">{{ book.mediaType === 'NOVEL' ? `${book.chapters.length} chapters` : `${book.pages.length} pages` }}</h2>
      <div v-if="book.mediaType === 'NOVEL'" class="surface mt-5 max-h-[60vh] overflow-y-auto rounded-xl divide-y divide-white/10"><div v-for="chapter in book.chapters" :key="chapter.sourceChapterId" class="flex justify-between gap-4 p-4 text-sm"><NuxtLink v-if="chapter.local?.scrapeStatus === 'COMPLETED' && book.localNovel" :to="`/novels/${book.localNovel.slug}/chapters/${chapter.local.id}`" class="text-gold underline">{{ chapter.titleOriginal }} · Read</NuxtLink><span v-else>{{ chapter.titleOriginal }}</span><span class="text-muted">{{ chapter.local?.scrapeStatus || 'Not downloaded' }}</span></div></div>
    </template>
  </div>
</template>
