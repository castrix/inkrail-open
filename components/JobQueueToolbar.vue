<script setup lang="ts">
const expanded = ref(false)
const { data, refresh } = useLazyFetch<any>('/api/jobs/active', { server: false, key: 'active-work' })
useVisiblePolling(() => refresh(), 10000)

const jobs = computed<any[]>(() => data.value?.items || [])
const counts = computed(() => data.value?.counts || { translation: 0, novel: 0, manga: 0, image: 0 })
const downloads = computed(() => counts.value.novel + counts.value.manga)

function typeLabel(job: any) {
  if (job.type === 'TRANSLATE_CHAPTER') return 'Translating'
  if (job.type === 'EXTRACT_ENTITIES') return 'Dictionary scan'
  if (job.type === 'DOWNLOAD_MANGA') return 'Manga download'
  if (job.type === 'GENERATE_CHARACTER_IMAGE') return 'Character art'
  if (job.type === 'DETECT_CHARACTER_SKINS') return 'Skin detection'
  return 'Novel download'
}

function title(job: any) {
  if (job.chapter) return job.chapter.titleTranslated || job.chapter.titleOriginal
  return job.novel?.titleOriginal || 'Unknown title'
}

function percent(job: any) {
  return job.total ? Math.min(100, Math.round(job.progress / job.total * 100)) : 0
}
</script>

<template>
  <div v-if="jobs.length || expanded" class="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
    <Transition enter-active-class="transition duration-150" enter-from-class="translate-y-2 opacity-0" leave-active-class="transition duration-100" leave-to-class="translate-y-2 opacity-0">
      <section v-if="expanded" class="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#151713]/95 shadow-2xl backdrop-blur-xl">
        <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div><div class="text-sm font-semibold">Active work</div><div class="mt-0.5 text-[10px] text-muted">Active, queued and paused work</div></div>
          <button class="rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-white" aria-label="Close active jobs" @click="expanded = false">✕</button>
        </header>
        <div class="flex gap-2 border-b border-white/8 px-4 py-2 text-[10px]">
          <span class="rounded-full bg-gold/10 px-2 py-1 text-gold">{{ counts.translation }} translating</span>
          <span class="rounded-full bg-white/5 px-2 py-1 text-muted">{{ counts.novel }} novel</span>
          <span class="rounded-full bg-white/5 px-2 py-1 text-muted">{{ counts.manga }} manga</span>
          <span v-if="counts.image" class="rounded-full bg-white/5 px-2 py-1 text-muted">{{ counts.image }} art</span>
        </div>
        <div class="max-h-[55vh] overflow-y-auto p-2">
          <div v-if="!jobs.length" class="px-4 py-8 text-center text-xs text-muted">No active or queued work.</div>
          <div v-for="job in jobs" :key="job.id" class="mb-1 rounded-xl border p-3 last:mb-0" :class="job.status === 'WAITING_FOR_ACCESS' ? 'border-amber-400/25 bg-amber-400/[.06]' : 'border-gold/20 bg-gold/[.055]'">
            <div class="flex items-start gap-2">
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="job.status === 'WAITING_FOR_ACCESS' ? 'bg-amber-400' : 'animate-pulse bg-gold'" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2"><span class="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">{{ typeLabel(job) }}</span><span class="text-[10px]" :class="job.status === 'WAITING_FOR_ACCESS' ? 'text-amber-300' : 'text-gold'">{{ job.status.replaceAll('_', ' ') }}</span></div>
                <div class="mt-1 truncate text-xs font-medium">{{ title(job) }}</div>
                <div class="mt-0.5 truncate text-[10px] text-muted">{{ job.novel?.titleOriginal }}</div><p v-if="!data?.translationEnabled && ['TRANSLATE_CHAPTER', 'EXTRACT_ENTITIES', 'REPAIR_TRANSLATION'].includes(job.type)" class="mt-2 text-xs text-gold">Translation is disabled. Set INKRAIL_ENABLE_TRANSLATION=true in tray Settings → Edit configuration, then apply configuration and restart.</p>
              </div>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <div class="h-1 flex-1 overflow-hidden rounded-full bg-white/8"><div class="h-full rounded-full bg-gold transition-all" :class="job.status !== 'WAITING_FOR_ACCESS' && !job.progress ? 'w-1/3 animate-pulse' : ''" :style="job.progress ? { width: `${percent(job)}%` } : undefined" /></div>
              <span class="w-14 text-right text-[10px] text-muted">{{ job.progress }}/{{ job.total }}</span>
            </div>
          </div>
        </div>
        <NuxtLink to="/admin" class="block border-t border-white/8 px-4 py-3 text-center text-xs font-semibold text-gold hover:bg-white/[.03]" @click="expanded = false">Open Workspace<span v-if="data?.total > jobs.length"> · all {{ data.total }} jobs</span></NuxtLink>
      </section>
    </Transition>
    <button class="flex h-11 items-center gap-2 rounded-full border px-3 shadow-2xl backdrop-blur-xl transition hover:-translate-y-0.5" :class="jobs.length ? 'border-gold/35 bg-[#1d1d17]/95 text-gold' : 'border-white/10 bg-[#171915]/90 text-muted'" :aria-expanded="expanded" aria-label="Toggle active jobs" @click="expanded = !expanded">
      <span class="relative grid h-6 w-6 place-items-center rounded-full bg-white/[.06] text-xs">⇅<span v-if="jobs.length" class="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-bold text-ink">{{ data?.total || jobs.length }}</span></span>
      <span class="text-[10px] sm:text-[11px]"><span v-if="data?.queued || data?.blocked">{{ data.queued }} queued · {{ data.blocked }} paused · </span><span class="sm:hidden">T <b>{{ counts.translation }}</b> · D <b>{{ downloads }}</b></span><span class="hidden sm:inline"><b>{{ counts.translation }}</b> translating · <b>{{ downloads }}</b> downloading</span></span>
    </button>
  </div>
</template>
