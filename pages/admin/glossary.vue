<script setup lang="ts">
const { data: library } = await useFetch('/api/library/novels')
const selectedNovelId = ref('')
const selectedSlug = computed(() => library.value?.find((item: any) => item.id === selectedNovelId.value)?.slug)
const { data: novel, refresh } = await useAsyncData<any>('selected-glossary', () => selectedSlug.value ? $fetch<any>(`/api/novels/${selectedSlug.value}` as any) : Promise.resolve(null), { watch: [selectedSlug] })
const form = reactive({ source: '', translation: '', category: 'term', notes: '', locked: true })
const message = ref('')

watchEffect(() => { if (!selectedNovelId.value && library.value?.length) selectedNovelId.value = library.value[0].id })
async function save() {
  await $fetch('/api/glossary', { method: 'POST', body: { novelId: selectedNovelId.value, ...form } })
  message.value = `${form.source} saved.`; form.source = ''; form.translation = ''; form.notes = ''; await refresh()
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-10 md:py-14">
    <NuxtLink to="/admin" class="text-sm text-white/40">← Workspace</NuxtLink>
    <h1 class="mt-6 font-serif text-4xl font-semibold">Translation glossary</h1>
    <p class="mt-3 text-sm text-white/45">Locked terms are passed to every Codex CLI translation for this novel.</p>
    <select v-model="selectedNovelId" class="field mt-7 max-w-md"><option disabled value="">Choose a novel</option><option v-for="item in library" :key="item.id" :value="item.id">{{ item.titleOriginal }}</option></select>
    <div v-if="selectedNovelId" class="mt-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <form class="surface rounded-2xl p-6" @submit.prevent="save">
        <h2 class="font-serif text-xl font-semibold">Add or update a term</h2>
        <label class="mt-5 block text-xs text-white/40">Chinese source</label><input v-model="form.source" class="field mt-2" required />
        <label class="mt-4 block text-xs text-white/40">Indonesian translation</label><input v-model="form.translation" class="field mt-2" required />
        <label class="mt-4 block text-xs text-white/40">Category</label><select v-model="form.category" class="field mt-2"><option>character</option><option>place</option><option>cultivation_rank</option><option>organization</option><option>technique</option><option>term</option></select>
        <label class="mt-4 block text-xs text-white/40">Notes</label><textarea v-model="form.notes" class="field mt-2 min-h-24" />
        <label class="mt-4 flex items-center gap-2 text-sm text-white/55"><input v-model="form.locked" type="checkbox" /> Require exact translation</label>
        <button class="btn btn-primary mt-5">Save term</button><p v-if="message" class="mt-3 text-sm text-gold">{{ message }}</p>
      </form>
      <div class="surface overflow-hidden rounded-2xl">
        <div v-if="!novel?.glossaryTerms.length" class="p-10 text-center text-sm text-white/35">No glossary terms yet. Codex can suggest new unlocked terms as it translates.</div>
        <div v-for="term in novel?.glossaryTerms" :key="term.id" class="grid grid-cols-[1fr_auto_1fr] gap-4 border-b border-white/8 px-5 py-4 last:border-0">
          <div><div class="font-serif text-lg">{{ term.source }}</div><div class="mt-1 text-xs text-white/30">{{ term.category }}</div></div><div class="self-center text-white/20">→</div><div><div>{{ term.translation }}</div><div class="mt-1 text-xs" :class="term.locked ? 'text-gold' : 'text-white/30'">{{ term.locked ? 'Locked' : 'Suggested' }} · v{{ term.version }}</div></div>
        </div>
      </div>
    </div>
  </div>
</template>
