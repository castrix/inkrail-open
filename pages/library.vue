<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const stringValue = (input: unknown) => typeof input === 'string' ? input : ''
const validMedia = (input: unknown): 'all' | 'NOVEL' | 'MANGA' => ['NOVEL', 'MANGA'].includes(stringValue(input)) ? stringValue(input) as 'NOVEL' | 'MANGA' : 'all'
const defaultView = (media: string): 'list' | 'grid' => media === 'MANGA' ? 'grid' : 'list'

const activeLibraryId = ref(stringValue(route.query.library) || 'all')
const query = ref(stringValue(route.query.q))
const mediaFilter = ref<'all' | 'NOVEL' | 'MANGA'>(validMedia(route.query.media))
const authorFilter = ref(stringValue(route.query.author))
const languageFilter = ref(stringValue(route.query.language))
const tagFilter = ref(stringValue(route.query.tag))
const viewMode = ref<'list' | 'grid'>(['list', 'grid'].includes(stringValue(route.query.view)) ? stringValue(route.query.view) as 'list' | 'grid' : defaultView(mediaFilter.value))
const libraryRequest = computed<Record<string, string>>(() => ({
  ...(activeLibraryId.value !== 'all' ? { libraryId: activeLibraryId.value } : {}),
  q: query.value.trim(), media: mediaFilter.value, author: authorFilter.value, language: languageFilter.value, tag: tagFilter.value
}))
const { ready, response, pending, loadingMore, error: fetchError, sentinel, loadMore, retry, refresh: refreshLibrary } = useLibraryPages(libraryRequest)
const librariesRequest = useFetch<any[]>('/api/libraries')
const { data: libraries, refresh: refreshLibraries } = librariesRequest
const novels = computed<any[]>(() => response.value?.items || [])
await Promise.all([ready, librariesRequest])
// SSR watchers do not rerun after async data settles; commit the first page before rendering.
if (!response.value && ready.data.value) response.value = ready.data.value
if (ready.error.value) fetchError.value = 'Could not open your library. Please retry.'
const filtersOpen = ref(false)
const removeTarget = ref<any>(null)
const creating = ref(false)
const newLibraryName = ref('')
const libraryError = ref('')
let applyingRoute = false
let lastWrittenQuery = ''
const viewExplicit = ref(Boolean(route.query.view))
const removingId = ref('')
const moveNovel = ref<any>(null)
const moveLibraryId = ref('')
const moving = ref(false)

function urlState() {
  return {
    library: activeLibraryId.value,
    ...(query.value ? { q: query.value } : {}),
    media: mediaFilter.value,
    ...(authorFilter.value ? { author: authorFilter.value } : {}),
    ...(languageFilter.value ? { language: languageFilter.value } : {}),
    ...(tagFilter.value ? { tag: tagFilter.value } : {}),
    view: viewMode.value
  }
}

watch(() => route.query, (next: Record<string, any>) => {
  applyingRoute = true
  const serialized = JSON.stringify(next)
  if (serialized !== lastWrittenQuery) viewExplicit.value = Boolean(next.view)
  lastWrittenQuery = ''
  activeLibraryId.value = stringValue(next.library) || 'all'
  query.value = stringValue(next.q)
  mediaFilter.value = validMedia(next.media)
  authorFilter.value = stringValue(next.author)
  languageFilter.value = stringValue(next.language)
  tagFilter.value = stringValue(next.tag)
  viewMode.value = ['list', 'grid'].includes(stringValue(next.view)) ? stringValue(next.view) as 'list' | 'grid' : defaultView(mediaFilter.value)
  nextTick(() => { applyingRoute = false })
})

watch([activeLibraryId, query, mediaFilter, authorFilter, languageFilter, tagFilter, viewMode], () => {
  if (applyingRoute) return
  const next = urlState()
  if (JSON.stringify(next) !== JSON.stringify(route.query)) {
    lastWrittenQuery = JSON.stringify(next)
    void router.replace({ query: next })
  }
})

watch(novels, (items: any[] | null) => {
  if (!viewExplicit.value && items?.length) viewMode.value = items.every((item: any) => item.mediaType === 'MANGA') ? 'grid' : 'list'
}, { immediate: true })

const filtered = novels
const mangaAuthors = computed<string[]>(() => response.value?.facets?.authors || [])
const mangaLanguages = computed<string[]>(() => response.value?.facets?.languages || [])
const mangaTags = computed<string[]>(() => response.value?.facets?.tags || [])
const hasFilters = computed(() => Boolean(query.value || mediaFilter.value !== 'all' || authorFilter.value || languageFilter.value || tagFilter.value))
const totalChapters = computed(() => response.value?.totalChapters || 0)
const translatedChapters = computed(() => response.value?.translatedChapters || 0)

function setMedia(media: 'all' | 'NOVEL' | 'MANGA') {
  viewExplicit.value = false
  mediaFilter.value = media
  viewMode.value = defaultView(media)
  if (media !== 'MANGA') { authorFilter.value = ''; languageFilter.value = ''; tagFilter.value = '' }
}

function selectLibrary(libraryId: string) {
  viewExplicit.value = false
  activeLibraryId.value = libraryId
}

function setView(mode: 'list' | 'grid') {
  viewExplicit.value = true
  viewMode.value = mode
}

function clearFilters() {
  query.value = ''
  authorFilter.value = ''
  languageFilter.value = ''
  tagFilter.value = ''
  setMedia('all')
}

async function addLibrary() {
  const name = newLibraryName.value.trim()
  if (!name) return
  libraryError.value = ''
  try {
    const library: any = await $fetch('/api/libraries', { method: 'POST', body: { name } })
    await refreshLibraries()
    activeLibraryId.value = library.id
    newLibraryName.value = ''
    creating.value = false
  } catch (cause: any) { libraryError.value = cause?.data?.statusMessage || 'Could not create library.' }
}

async function removeFromLibrary(novel: any) {
  if (removingId.value) return
  if (removeTarget.value?.id !== novel.id) { removeTarget.value = novel; return }
  removingId.value = novel.id
  libraryError.value = ''
  try {
    await $fetch('/api/library/bookmark', {
      method: 'DELETE',
      body: { novelId: novel.id, ...(activeLibraryId.value !== 'all' ? { libraryId: activeLibraryId.value } : {}) }
    })
    await Promise.all([refreshLibrary(), refreshLibraries()])
  } catch (cause: any) { libraryError.value = cause?.data?.statusMessage || 'Could not remove this bookmark.' }
  finally { removingId.value = ''; removeTarget.value = null }
}

function openMove(novel: any) {
  moveNovel.value = novel
  moveLibraryId.value = novel.libraries?.[0]?.id || libraries.value?.[0]?.id || ''
}

async function moveBookmark() {
  if (!moveNovel.value || !moveLibraryId.value || moving.value) return
  moving.value = true
  libraryError.value = ''
  try {
    await $fetch('/api/library/bookmark', {
      method: 'PATCH', body: { novelId: moveNovel.value.id, libraryId: moveLibraryId.value }
    })
    moveNovel.value = null
    await Promise.all([refreshLibrary(), refreshLibraries()])
  } catch (cause: any) { libraryError.value = cause?.data?.statusMessage || 'Could not move this bookmark.' }
  finally { moving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 pb-28 pt-5 md:pb-32 md:pt-8">
    <section class="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 class="font-serif text-3xl font-semibold sm:text-4xl">Library</h1><NuxtLink to="/sources" class="btn btn-primary">＋ Browse</NuxtLink></section>

    <section class="mb-6 flex gap-2 overflow-x-auto border-b border-white/10 pb-3">
      <button class="whitespace-nowrap rounded-xl px-4 py-2 text-sm" :class="activeLibraryId === 'all' ? 'bg-gold font-semibold text-ink' : 'bg-white/5 text-muted'" @click="selectLibrary('all')">All <span class="ml-1 opacity-60">{{ response?.allCount ?? "…" }}</span></button>
      <button v-for="library in libraries" :key="library.id" class="whitespace-nowrap rounded-xl px-4 py-2 text-sm" :class="activeLibraryId === library.id ? 'bg-gold font-semibold text-ink' : 'bg-white/5 text-muted'" @click="selectLibrary(library.id)">{{ library.name }} <span class="ml-1 opacity-60">{{ library._count.novels }}</span></button>
      <button class="whitespace-nowrap rounded-xl border border-dashed border-white/15 px-4 py-2 text-sm text-muted hover:border-gold/50 hover:text-white" @click="creating = !creating">＋ Library</button>
    </section>
    <form v-if="creating" class="surface mb-6 flex flex-wrap max-w-lg gap-3 rounded-2xl p-4" @submit.prevent="addLibrary"><input aria-label="Library name" v-model="newLibraryName" class="field" placeholder="Library name" autofocus /><button class="btn btn-primary" :disabled="!newLibraryName.trim()">Create</button></form>
    <p v-if="libraryError" class="mb-5 text-sm text-[#efa58b]">{{ libraryError }}</p>

    <section class="mb-5 space-y-3">
      <div class="flex gap-2"><input v-model="query" aria-label="Search your library" class="field" placeholder="Search your library…" /><button class="btn btn-quiet" @click="filtersOpen = true">Filters{{ hasFilters ? ' •' : '' }}</button></div>
      <div class="flex flex-wrap items-center justify-between gap-2"><span class="text-sm text-muted">{{ response?.total ?? '…' }} titles</span><div class="flex gap-2"><button class="btn btn-quiet" :aria-pressed="viewMode === 'list'" @click="setView('list')">List</button><button class="btn btn-quiet" :aria-pressed="viewMode === 'grid'" @click="setView('grid')">Grid</button></div></div>
      <p class="text-xs text-muted">Adult titles are visible only in their selected library.</p>
    </section>
    <AppDialog v-if="filtersOpen" title="Library filters" @close="filtersOpen = false"><div class="grid gap-4">
      <label>Format<select aria-label="Format" :value="mediaFilter" class="field mt-2" @change="setMedia(($event.target as HTMLSelectElement).value as any)"><option value="all">All formats</option><option value="NOVEL">Novels</option><option value="MANGA">Manga</option></select></label>
      <template v-if="mediaFilter !== 'NOVEL'"><label>Author<select aria-label="Author" v-model="authorFilter" class="field mt-2"><option value="">All manga authors</option><option v-for="author in mangaAuthors" :key="author">{{ author }}</option></select></label><label>Language<select aria-label="Language" v-model="languageFilter" class="field mt-2"><option value="">All languages</option><option v-for="language in mangaLanguages" :key="language">{{ language }}</option></select></label><label>Tag<select aria-label="Tag" v-model="tagFilter" class="field mt-2"><option value="">All tags</option><option v-for="tag in mangaTags" :key="tag">{{ tag }}</option></select></label></template>
      <div class="flex flex-wrap gap-2"><button class="btn btn-quiet" @click="clearFilters">Clear filters</button><button class="btn btn-primary" @click="filtersOpen = false">Show {{ response?.total ?? '' }} titles</button></div>
    </div></AppDialog>
    <p v-if="fetchError" role="alert" class="mb-4 text-sm text-[#efa58b]">{{ fetchError }} <button class="underline" @click="retry">Retry</button></p>
    <p v-if="pending && filtered.length" role="status" class="mb-4 text-sm text-muted">Updating titles…</p>
    <div v-if="pending && !filtered.length" aria-label="Opening your library" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"><div v-for="n in 10" :key="n" class="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" /></div>
    <section v-else-if="filtered.length" :class="viewMode === 'grid' ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'space-y-3'">
      <article v-for="novel in filtered" :key="novel.id" class="surface group relative overflow-hidden rounded-2xl">
      <NuxtLink :to="novel.mediaType === 'MANGA' ? `/manga/${novel.slug}` : `/novels/${novel.slug}`" class="block">
        <template v-if="viewMode === 'grid'">
          <div class="relative aspect-[2/3] overflow-hidden bg-gradient-to-br from-moss to-ink"><BookCover :src="novel.coverUrl" :title="novel.titleOriginal" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" /><div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" /><div class="absolute bottom-3 left-3 flex gap-1"><span class="badge badge-muted">{{ novel.mediaType === 'MANGA' ? 'Manga' : 'Novel' }}</span><span v-if="novel.contentRating === 'ADULT'" class="badge badge-bad">Adult</span></div></div>
          <div class="p-4"><h2 class="line-clamp-2 font-serif text-lg font-semibold leading-snug">{{ novel.titleTranslated || novel.titleOriginal }}</h2><p class="mt-2 truncate text-xs text-muted">{{ novel.author || 'Unknown creator' }}</p><p class="mt-3 text-[11px] text-muted">{{ novel.mediaType === 'MANGA' ? `${novel.downloadedPageCount} downloaded · ${novel.chapterCount} pages` : `${novel.scrapedCount} downloaded · ${novel.chapterCount} chapters` }}</p></div>
        </template>
        <template v-else>
          <div class="grid min-h-[132px] grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[105px_minmax(0,1fr)]"><div class="overflow-hidden bg-gradient-to-br from-moss to-ink"><BookCover :src="novel.coverUrl" :title="novel.titleOriginal" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" /></div><div class="flex min-w-0 flex-col p-4 sm:p-5"><div class="flex items-start justify-between gap-3"><div class="flex gap-1"><span class="badge badge-muted">{{ novel.mediaType === 'MANGA' ? 'Manga' : (novel.category || 'Novel') }}</span><span v-if="novel.contentRating === 'ADULT'" class="badge badge-bad">Adult</span></div><span class="shrink-0 text-xs text-muted">{{ novel.sourceStatus }}</span></div><h2 class="mt-2 line-clamp-2 font-serif text-xl font-semibold">{{ novel.titleTranslated || novel.titleOriginal }}</h2><p class="mt-1 truncate text-sm text-muted">{{ novel.author || 'Unknown creator' }}</p><div class="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-muted"><span>{{ novel.mediaType === 'MANGA' ? `${novel.downloadedPageCount}/${novel.chapterCount} pages downloaded` : `${novel.scrapedCount}/${novel.chapterCount} chapters downloaded` }}</span><span v-for="library in novel.libraries" :key="library.id" class="rounded-full bg-white/5 px-2 py-1 text-[10px]">{{ library.name }}</span></div></div></div>
        </template>
      </NuxtLink>
      <div class="relative flex justify-end gap-2 px-3 pb-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><button class="rounded-lg border border-white/10 bg-black/75 px-2.5 py-1.5 text-[11px] text-white/60 backdrop-blur hover:border-gold/50 hover:text-gold" @click="openMove(novel)">Move</button><button class="rounded-lg border border-white/10 bg-black/75 px-2.5 py-1.5 text-[11px] text-muted backdrop-blur hover:border-[#efa58b]/50 hover:text-[#efa58b]" :disabled="removingId === novel.id" @click="removeFromLibrary(novel)">{{ removingId === novel.id ? 'Removing…' : 'Remove' }}</button></div>
      </article>
    </section>
    <section v-else-if="!fetchError" class="surface rounded-3xl px-6 py-20 text-center"><div class="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 font-serif text-2xl text-gold">文</div><h2 class="font-serif text-2xl font-semibold">{{ hasFilters ? 'No matching titles' : 'Nothing on this shelf yet' }}</h2><p class="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{{ hasFilters ? 'Try another search or clear your filters.' : 'Browse an installed source and bookmark a title. Content is downloaded only when you ask.' }}</p><NuxtLink to="/sources" class="btn btn-primary mt-7">Browse sources</NuxtLink></section>

    <div ref="sentinel" class="py-8 text-center text-sm text-muted">
      <button v-if="response?.hasMore" class="btn btn-quiet" :disabled="pending || loadingMore" @click="loadMore">{{ loadingMore ? 'Loading more…' : 'Load more' }}</button>
      <span v-else-if="filtered.length && !pending">All {{ response?.total }} titles loaded</span>
    </div>
    <AppDialog v-if="moveNovel" title="Move bookmark" @close="moveNovel = null">
      <section class="surface w-full max-w-md rounded-3xl p-6 shadow-2xl"><p class="text-xs font-semibold uppercase tracking-[.2em] text-gold">Move bookmark</p><h2 class="mt-3 line-clamp-2 font-serif text-2xl font-semibold">{{ moveNovel.titleTranslated || moveNovel.titleOriginal }}</h2><label for="move-library" class="mt-6 block text-xs text-muted">Destination library</label><select id="move-library" v-model="moveLibraryId" class="field mt-2"><option v-for="library in libraries" :key="library.id" :value="library.id">{{ library.name }}</option></select><div class="mt-6 flex justify-end gap-2"><button class="btn btn-quiet" :disabled="moving" @click="moveNovel = null">Cancel</button><button class="btn btn-primary" :disabled="moving || !moveLibraryId" @click="moveBookmark">{{ moving ? 'Moving…' : 'Move bookmark' }}</button></div></section>
    </AppDialog>
    <AppDialog v-if="removeTarget" title="Remove bookmark?" @close="removeTarget = null"><p class="mb-5">Remove {{ removeTarget.titleTranslated || removeTarget.titleOriginal }} from {{ activeLibraryId === 'all' ? 'your libraries' : 'this library' }}? Downloaded files and reading progress stay on this computer.</p><button class="btn btn-danger" :disabled="Boolean(removingId)" @click="removeFromLibrary(removeTarget)">Remove bookmark</button></AppDialog>
  </div>
</template>
