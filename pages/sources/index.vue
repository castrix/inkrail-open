<script setup lang="ts">
const { data: sources } = await useFetch<any[]>('/api/sources')
const showAdult = useAdultVisibility()
const hiddenSources = computed(() => (sources.value || []).filter(s => s.contentRating === 'ADULT'))
function capabilityLabel(value: string) { return ({ search: 'Search', browse: 'Browse', chapters: 'Novel reading', pages: 'Manga reading', browser: 'Browser support' } as Record<string, string>)[value] }
function languageLabel(value: string) { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(value) || value } catch { return value } }
const novelSources = computed(() => (sources.value || []).filter(source => source.mediaType === 'NOVEL' && (showAdult.value || source.contentRating !== 'ADULT')))
const mangaSources = computed(() => (sources.value || []).filter(source => source.mediaType === 'MANGA' && (showAdult.value || source.contentRating !== 'ADULT')))
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 py-10 md:py-14">
    <p class="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-gold">Browse</p>
    <NuxtLink to="/extensions" class="btn btn-quiet mb-5">Manage extensions</NuxtLink>
    <h1 class="font-serif text-4xl font-semibold md:text-6xl">Sources</h1>
    <div class="mt-4 flex items-center justify-between gap-4"><p class="max-w-2xl text-sm leading-7 text-muted">Browse a source directly. Nothing is added or downloaded until you choose it.</p><button class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 transition hover:border-gold/40 hover:text-gold" :class="showAdult ? 'bg-gold/10 text-gold' : 'text-muted'" :aria-label="showAdult ? 'Hide adult sources' : 'Show adult sources'" :title="showAdult ? 'Hide adult sources' : 'Show adult sources'" @click="showAdult = !showAdult"><svg v-if="showAdult" viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><svg v-else viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="1.8"><path d="M3 3l18 18M10.6 6.1A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.8M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1 0 2-.2 2.9-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button></div>
    <div v-if="!sources?.length" class="surface mt-6 rounded-2xl p-6"><h2 class="text-xl">Install your first source</h2><p class="my-3 text-muted">Sources provide books to browse. Add the public repository in Extensions, then install a source.</p><NuxtLink to="/extensions" class="btn btn-primary">Install sources</NuxtLink></div>
    <p v-else-if="!showAdult && hiddenSources.length" class="mt-5 text-sm text-muted">{{ hiddenSources.length }} installed source(s) hidden by the adult-content filter: {{ hiddenSources.map((s: any) => s.name).join(', ') }}. Use the eye button to show them.</p>
    <section class="mt-10">
      <div class="mb-4 flex items-center gap-3"><h2 class="font-serif text-2xl font-semibold">Novels</h2><span class="badge badge-muted">{{ novelSources.length }}</span></div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="source in novelSources" :key="source.id" :to="`/sources/${source.id}`" class="surface group rounded-2xl p-6 transition hover:border-gold/40">
        <div class="flex items-start justify-between gap-4">
          <div class="grid h-12 w-12 place-items-center rounded-2xl font-serif text-xl font-bold" :class="source.contentRating === 'ADULT' ? 'bg-[#b75b65] text-white' : 'bg-gold text-ink'">{{ source.icon }}</div>
          <div class="flex gap-2"><span v-if="source.contentRating === 'ADULT'" class="badge badge-bad">Adult</span><span class="badge badge-good">Installed</span></div>
        </div>
        <h2 class="mt-6 font-serif text-2xl font-semibold group-hover:text-gold">{{ source.name }}</h2>
        <p class="mt-2 text-sm text-muted">{{ languageLabel(source.language) }}</p>
        <div class="mt-5 flex flex-wrap gap-2"><span v-for="capability in source.capabilities.filter((value: string) => capabilityLabel(value))" :key="capability" class="badge badge-muted">{{ capabilityLabel(capability) }}</span></div>
      </NuxtLink>
      </div>
    </section>
    <section class="mt-12">
      <div class="mb-4 flex items-center gap-3"><h2 class="font-serif text-2xl font-semibold">Manga</h2><span class="badge badge-muted">{{ mangaSources.length }}</span></div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="source in mangaSources" :key="source.id" :to="`/sources/${source.id}`" class="surface group rounded-2xl p-6 transition hover:border-gold/40">
          <div class="flex items-start justify-between gap-4"><div class="grid h-12 w-12 place-items-center rounded-2xl bg-[#b75b65] font-serif text-xl font-bold text-white">{{ source.icon }}</div><div class="flex gap-2"><span v-if="source.contentRating === 'ADULT'" class="badge badge-bad">Adult</span><span class="badge badge-good">Installed</span></div></div>
          <h2 class="mt-6 font-serif text-2xl font-semibold group-hover:text-gold">{{ source.name }}</h2><p class="mt-2 text-sm text-muted">{{ languageLabel(source.language) }}</p><div class="mt-5 flex flex-wrap gap-2"><span v-for="capability in source.capabilities.filter((value: string) => capabilityLabel(value))" :key="capability" class="badge badge-muted">{{ capabilityLabel(capability) }}</span></div>
        </NuxtLink>
        <div v-if="!mangaSources.length" class="surface rounded-2xl border-dashed p-6 text-sm text-muted">{{ sources?.length ? 'No manga sources match your visibility settings. Manage extensions or change the content filter.' : 'Install a manga source to get started.' }}</div>
      </div>
    </section>
  </div>
</template>
