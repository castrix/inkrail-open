<script setup lang="ts">
const route = useRoute()
type GlobalState = { query: string, source: string }
const { data: installedSources } = await useFetch<any[]>('/api/sources')
const sourceValues = ['all', ...(installedSources.value || []).map(s => s.id)]
const initialSource = sourceValues.includes(route.query.source as GlobalState['source']) ? route.query.source as GlobalState['source'] : 'all'
const { state, clear: clearStored } = usePersistedSearchState<GlobalState>('global', { query: '', source: 'all' }, { ...(route.query.q ? { query: String(route.query.q) } : {}), ...(route.query.source ? { source: initialSource } : {}) })
const { query, source: sourceFilter } = toRefs(state)
const submitted = ref(String(route.query.q || ''))
const includeAdult = useAdultVisibility()
onMounted(() => { if (route.query.adult === '1') includeAdult.value = true; submitted.value = query.value.trim() })
const requestQuery = computed(() => ({ q: submitted.value, includeAdult: includeAdult.value ? '1' : '0', source: sourceFilter.value }))
const { data: localData, pending: localPending } = await useFetch<any>('/api/search', { query: computed(() => ({ ...requestQuery.value, scope: 'local' })), watch: [submitted, includeAdult] })
const { data: sourceData, pending: sourcePending } = useLazyFetch<any>('/api/search', { server: false, query: computed(() => ({ ...requestQuery.value, scope: 'sources' })), watch: [submitted, includeAdult] })
function search() {
  if (installedSources.value?.some(s => s.id === sourceFilter.value && s.contentRating === 'ADULT')) includeAdult.value = true
  submitted.value = query.value.trim()
  navigateTo({ path: '/search', query: { q: submitted.value || undefined, ...(sourceFilter.value !== 'all' ? { source: sourceFilter.value } : {}), adult: includeAdult.value ? '1' : undefined } }, { replace: true })
}
async function clearFilters() { clearStored(); submitted.value = ''; await navigateTo('/search', { replace: true }) }
function sourcePath(item: any) { return `/sources/${item.sourceSite}/books/${item.sourceNovelId}` }
let hydrating = false
watch(sourceData, (value: any) => {
  if (hydrating || !value?.cache?.some((entry: any) => entry.state === 'stale')) return
  hydrating = true
  setTimeout(async () => {
    try { sourceData.value = await $fetch('/api/search', { query: { ...requestQuery.value, scope: 'sources', revalidate: '1' } }) } finally { hydrating = false }
  }, 400)
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 py-10 md:py-14">
    <p class="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-gold/80">Everywhere at once</p>
    <h1 class="font-serif text-4xl font-semibold md:text-6xl">Global search</h1>
    <form class="mt-8 grid max-w-4xl gap-2 sm:grid-cols-[1fr_190px_auto_auto_auto]" @submit.prevent="search"><input v-model="query" autofocus class="field" placeholder="Titles, authors, tags…" /><select v-model="sourceFilter" class="field"><option value="all">All sources</option><option v-for="source in installedSources" :key="source.id" :value="source.id">{{ source.name }}</option></select><button class="btn btn-primary">Search</button><button type="button" class="btn btn-quiet" @click="clearFilters">Clear</button><button type="button" class="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl border border-white/10" :class="includeAdult ? 'bg-gold/10 text-gold' : 'text-white/35'" :aria-label="includeAdult ? 'Hide adult sources' : 'Include adult sources'" :title="includeAdult ? 'Hide adult sources' : 'Include adult sources'" @click="includeAdult = !includeAdult; search()"><svg v-if="includeAdult" viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><svg v-else viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="1.8"><path d="M3 3l18 18M10.6 6.1A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.8M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1 0 2-.2 2.9-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button></form>
    <p class="mt-3 text-xs text-white/35">Adult libraries and sources are excluded until the eye button is enabled.</p>

    <template v-if="submitted">
      <section class="mt-12"><div class="mb-5 flex items-end justify-between"><div><p class="text-xs uppercase tracking-[.18em] text-white/30">On this device</p><h2 class="mt-1 font-serif text-3xl font-semibold">Your libraries</h2></div><span class="text-sm text-white/35">{{ localData?.local?.length || 0 }} found</span></div>
        <p v-if="localPending" class="surface rounded-2xl p-6 text-sm text-white/40">Searching your libraries…</p><div v-else-if="localData?.local?.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NuxtLink v-for="item in localData.local" :key="item.id" :to="item.mediaType === 'MANGA' ? `/manga/${item.slug}` : `/novels/${item.slug}`" class="surface flex gap-4 rounded-2xl p-3"><img v-if="item.coverUrl" :src="item.coverUrl" class="h-24 w-16 rounded-lg object-cover" /><div class="min-w-0 py-1"><span class="badge badge-muted">{{ item.mediaType === 'MANGA' ? 'Manga' : 'Novel' }}</span><h3 class="mt-2 line-clamp-2 font-serif font-semibold">{{ item.titleTranslated || item.titleOriginal }}</h3><p class="mt-1 truncate text-xs text-white/40">{{ item.author || item.sourceSite }}</p></div></NuxtLink></div><p v-else class="surface rounded-2xl p-6 text-sm text-white/40">No matching bookmark.</p>
      </section>
      <section class="mt-12"><div class="mb-5 flex items-end justify-between"><div><p class="text-xs uppercase tracking-[.18em] text-white/30">Live results</p><h2 class="mt-1 font-serif text-3xl font-semibold">Sources</h2></div><span class="text-sm text-white/35">{{ sourceData?.sources?.length || 0 }} found</span></div>
        <p v-if="sourcePending" class="surface rounded-2xl p-6 text-sm text-white/40">Searching live sources… Your library results are already available above.</p><div v-else-if="sourceData?.sources?.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NuxtLink v-for="item in sourceData.sources" :key="`${item.sourceSite}-${item.sourceNovelId}`" :to="sourcePath(item)" class="surface flex gap-4 rounded-2xl p-3"><img v-if="item.coverUrl" :src="item.coverUrl" class="h-24 w-16 rounded-lg object-cover" /><div class="min-w-0 py-1"><span class="badge badge-muted">{{ item.sourceSite }}</span><h3 class="mt-2 line-clamp-2 font-serif font-semibold">{{ item.titleOriginal }}</h3><p class="mt-1 truncate text-xs text-white/40">{{ item.author || item.category || 'Unknown creator' }}</p></div></NuxtLink></div><p v-else class="surface rounded-2xl p-6 text-sm text-white/40">No source matches. Enable the eye to include adult sources.</p>
        <p v-for="problem in sourceData?.errors || []" :key="problem.source" class="mt-3 text-xs text-[#efa58b]">{{ problem.source }} could not be searched: {{ problem.message }}</p>
      </section>
    </template>
  </div>
</template>
