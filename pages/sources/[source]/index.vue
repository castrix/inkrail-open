<script setup lang="ts">
const route = useRoute()
const source = String(route.params.source)
const { data: sources } = await useFetch<any[]>('/api/sources')
const manifest = computed(() => sources.value?.find(s => s.id === source))
useHead({ title: () => `${manifest.value?.name || 'Source unavailable'} — Inkrail` })
const { state } = usePersistedSearchState<any>(`source:${source}`, { query: '', page: 1, filters: {} }, {})
const query = computed({ get: () => state.query, set: (value: string) => { state.query = value } })
const page = computed({ get: () => state.page, set: (value: number) => { state.page = value } })
const filters = computed<Record<string, string>>(() => state.filters)
for (const field of manifest.value?.filters || []) filters.value[field.key] ||= field.default || field.options?.[0] || ''
const scrollState = useState<Record<string, number>>('source-browse-scroll', () => ({}))
onBeforeUnmount(() => { scrollState.value[source] = window.scrollY })
const results = ref<any[]>([]), hasNext = ref(false), busy = ref(false), error = ref('')
async function browse(reset = true) {
  if (!manifest.value) return
  if (reset) page.value = 1
  busy.value = true; error.value = ''
  try { const response: any = await $fetch(`/api/sources/${source}/browse`, { query: { query: query.value, page: page.value, ...filters.value } }); results.value = response.results || []; hasNext.value = response.hasNext === true }
  catch (cause: any) { error.value = cause.data?.data?.message || cause.data?.statusMessage || 'Could not reach this source. Check your connection and try again.' }
  finally { busy.value = false }
}
onMounted(async () => { await browse(false); await nextTick(); requestAnimationFrame(() => window.scrollTo(0, scrollState.value[source] || 0)) })
</script>
<template>
  <div class="mx-auto max-w-6xl px-5 py-10">
    <NuxtLink class="text-sm text-gold" to="/sources">← Sources</NuxtLink>
    <h1 class="mt-5 font-serif text-4xl">{{ manifest?.name || 'Source unavailable' }}</h1>
    <p v-if="!manifest" class="mt-4">Install or enable this source in <NuxtLink class="text-gold" to="/extensions">Extensions</NuxtLink>.</p>
    <template v-else>
      <form class="my-7 flex flex-wrap items-end gap-3" @submit.prevent="browse()">
        <label class="grid min-w-48 flex-1 gap-2 text-sm">Search<input v-model="query" class="field" placeholder="Title, author, or source query" /></label>
        <label v-for="field in manifest.filters" :key="field.key" class="grid gap-2 text-sm">{{ field.label }}<select v-if="field.type === 'select'" v-model="filters[field.key]" class="field"><option v-for="option in field.options" :key="option">{{ option }}</option></select><input v-else v-model="filters[field.key]" class="field" /></label>
        <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Loading…' : 'Search' }}</button>
      </form>
      <div v-if="results.length" class="mb-4 flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted">Page {{ page }} · {{ results.length }} results</p><div class="flex gap-2"><button class="btn btn-quiet" :disabled="busy || page === 1" @click="page--; browse(false)">Previous page</button><button class="btn btn-quiet" :disabled="busy || !hasNext" @click="page++; browse(false)">Next page</button></div></div>
      <p v-if="error" role="alert" class="mb-6 text-red-300">{{ error }} <button class="btn btn-quiet ml-2" @click="browse(false)">Retry</button></p>
      <p v-if="!busy && !results.length && !error" class="text-muted">{{ source === 'twkan' && !query ? 'Search TWKAN by title or author to see books. This source does not provide a front-page catalog.' : 'No matching titles. Try a different search or filter.' }}</p>
      <p v-if="busy" role="status" class="mb-4">Searching {{ manifest.name }}…</p><div v-if="busy && !results.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true"><div v-for="n in 6" :key="n" class="aspect-[3/4] animate-pulse rounded-xl bg-white/10" /></div>
      <div :aria-busy="busy" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NuxtLink v-for="item in results" :key="item.sourceNovelId" :to="`/sources/${source}/books/${encodeURIComponent(item.sourceNovelId)}`" class="surface overflow-hidden rounded-xl">
          <BookCover v-if="item.coverUrl" :src="`/api/sources/${source}/cover/${encodeURIComponent(item.sourceNovelId)}`" :title="item.titleOriginal" class="aspect-[3/4] w-full" />
          <div v-else class="grid aspect-[3/4] place-items-center bg-white/5 font-serif text-4xl text-gold">{{ manifest.icon }}</div>
          <div class="p-4"><h2 class="line-clamp-3">{{ item.titleOriginal }}</h2><p class="mt-2 text-xs text-muted">{{ item.author }}</p></div>
        </NuxtLink>
      </div>
      <div class="mt-7 flex items-center gap-4"><button class="btn btn-quiet" :disabled="busy || page === 1" @click="page--; browse(false)">Previous</button><span class="text-sm">Page {{ page }}</span><button class="btn btn-quiet" :disabled="busy || !hasNext" @click="page++; browse(false)">Next</button></div>
    </template>
  </div>
</template>
