<script setup lang="ts">
const route = useRoute()
const source = String(route.params.source)
const { data: sources } = await useFetch<any[]>('/api/sources')
const manifest = computed(() => sources.value?.find(s => s.id === source))
const query = ref(''), page = ref(1), filters = reactive<Record<string, string>>({})
for (const field of manifest.value?.filters || []) filters[field.key] = field.default || ''
const results = ref<any[]>([]), hasNext = ref(false), busy = ref(false), error = ref('')
async function browse(reset = true) {
  if (!manifest.value) return
  if (reset) page.value = 1
  busy.value = true; error.value = ''
  try { const response: any = await $fetch(`/api/sources/${source}/browse`, { query: { query: query.value, page: page.value, ...filters } }); results.value = response.results || []; hasNext.value = response.hasNext === true }
  catch (cause: any) { error.value = cause.data?.message || cause.message }
  finally { busy.value = false }
}
onMounted(() => browse())
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
      <p v-if="error" role="alert" class="mb-6 text-red-300">{{ error }}</p>
      <p v-if="!busy && !results.length && !error" class="text-white/45">No results. Try a search.</p>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NuxtLink v-for="item in results" :key="item.sourceNovelId" :to="`/sources/${source}/books/${encodeURIComponent(item.sourceNovelId)}`" class="surface overflow-hidden rounded-xl">
          <img v-if="item.coverUrl" :src="`/api/sources/${source}/cover/${encodeURIComponent(item.sourceNovelId)}`" loading="lazy" referrerpolicy="no-referrer" alt="" class="aspect-[3/4] w-full object-cover" />
          <div v-else class="grid aspect-[3/4] place-items-center bg-white/5 font-serif text-4xl text-gold">{{ manifest.icon }}</div>
          <div class="p-4"><h2 class="line-clamp-3">{{ item.titleOriginal }}</h2><p class="mt-2 text-xs text-white/45">{{ item.author }}</p></div>
        </NuxtLink>
      </div>
      <div class="mt-7 flex items-center gap-4"><button class="btn btn-quiet" :disabled="busy || page === 1" @click="page--; browse(false)">Previous</button><span class="text-sm">Page {{ page }}</span><button class="btn btn-quiet" :disabled="busy || !hasNext" @click="page++; browse(false)">Next</button></div>
    </template>
  </div>
</template>
