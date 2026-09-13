<script setup lang="ts">
const { data: library } = await useFetch('/api/library/novels')
const selectedNovelId = ref('')
const selectedSlug = computed(() => library.value?.find((item: any) => item.id === selectedNovelId.value)?.slug)
const { data: novel, refresh } = await useAsyncData<any>('selected-glossary', () => selectedSlug.value ? $fetch<any>(`/api/novels/${selectedSlug.value}` as any) : Promise.resolve(null), { watch: [selectedSlug] })
const form = reactive({ source: '', translation: '', category: 'term', notes: '', locked: true })
const message = ref(''), saving = ref(false), failed = ref(false), query = ref(''), sort = ref('source')
const terms = computed<any[]>(() => (novel.value?.glossaryTerms || []).filter((term: any) => `${term.source} ${term.translation} ${term.category}`.toLowerCase().includes(query.value.toLowerCase())).slice().sort((a: any, b: any) => String(a[sort.value]).localeCompare(String(b[sort.value]))))
function editTerm(term: any) { Object.assign(form, { source: term.source, translation: term.translation, category: term.category, notes: term.notes || '', locked: term.locked }); document.getElementById('glossary-source')?.focus() }

watchEffect(() => { if (!selectedNovelId.value && library.value?.length) selectedNovelId.value = library.value[0].id })
async function save() {
  if (saving.value) return
  saving.value = true; message.value = ''; failed.value = false
  try { await $fetch('/api/glossary', { method: 'POST', body: { novelId: selectedNovelId.value, ...form } })
  message.value = `${form.source} saved.`; form.source = ''; form.translation = ''; form.notes = ''; await refresh()
  } catch (error: any) { failed.value = true; message.value = error.data?.statusMessage || 'Could not save this term. Check your connection and retry; your input has been kept.' } finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-10 md:py-14">
    <NuxtLink to="/admin" class="text-sm text-muted">← Workspace</NuxtLink>
    <h1 class="mt-6 font-serif text-4xl font-semibold">Translation glossary</h1>
    <p class="mt-3 text-sm text-muted">Locked terms are passed to every Codex CLI translation for this novel.</p>
    <select aria-label="Novel glossary" v-model="selectedNovelId" class="field mt-7 max-w-md"><option disabled value="">Choose a novel</option><option v-for="item in library" :key="item.id" :value="item.id">{{ item.titleOriginal }}</option></select>
    <div v-if="selectedNovelId" class="mt-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <form class="surface rounded-2xl p-6" @submit.prevent="save">
        <h2 class="font-serif text-xl font-semibold">Add or update a term</h2>
        <label for="glossary-source" class="mt-5 block text-xs text-muted">Source text</label><input id="glossary-source" v-model="form.source" class="field mt-2" required />
        <label for="glossary-translation" class="mt-4 block text-xs text-muted">Translation</label><input id="glossary-translation" v-model="form.translation" class="field mt-2" required />
        <label for="glossary-category" class="mt-4 block text-xs text-muted">Category</label><select id="glossary-category" v-model="form.category" class="field mt-2"><option>character</option><option>place</option><option value="cultivation_rank">Cultivation rank</option><option>organization</option><option>technique</option><option>term</option></select>
        <label for="glossary-notes" class="mt-4 block text-xs text-muted">Notes</label><textarea id="glossary-notes" v-model="form.notes" class="field mt-2 min-h-24" />
        <label class="mt-4 flex items-center gap-2 text-sm text-muted"><input v-model="form.locked" type="checkbox" /> Require exact translation</label>
        <button class="btn btn-primary mt-5" :disabled="saving">{{ saving ? 'Saving…' : 'Save term' }}</button><p v-if="message" :role="failed ? 'alert' : 'status'" class="mt-3 text-sm text-gold">{{ message }}</p>
      </form>
      <div class="surface overflow-hidden rounded-2xl"><div class="grid gap-3 p-4"><input v-model="query" type="search" class="field" aria-label="Find glossary term" placeholder="Find a term…" /><select v-model="sort" aria-label="Sort glossary" class="field"><option value="source">Source text A–Z</option><option value="translation">Translation A–Z</option><option value="category">Category</option></select><p v-if="!terms.length && query" role="status">No matching terms.</p></div>
        <div v-if="!novel?.glossaryTerms.length" class="p-10 text-center text-sm text-muted">No glossary terms yet. Codex can suggest new unlocked terms as it translates.</div>
        <div v-for="term in terms" :key="term.id" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 break-words border-b border-white/8 px-5 py-4 last:border-0">
          <div><div class="font-serif text-lg">{{ term.source }}</div><div class="mt-1 text-xs text-muted">{{ term.category.replaceAll('_', ' ') }}</div></div><div class="self-center text-muted">→</div><div><div>{{ term.translation }}</div><div class="mt-1 text-xs" :class="term.locked ? 'text-gold' : 'text-muted'">{{ term.locked ? 'Locked' : 'Suggested' }} · v{{ term.version }}</div><button type="button" class="btn btn-quiet mt-2" @click="editTerm(term)">Edit</button></div>
        </div>
      </div>
    </div>
  </div>
</template>
