<script setup lang="ts">
const route = useRoute()
const base = `/api/novels/${encodeURIComponent(String(route.params.slug))}`
const filter = ref<'all' | 'ready' | 'untranslated'>('all')
const chapterSearch = ref('')
const appliedSearch = ref('')
const chapterPage = ref<number | undefined>(undefined)
const chapterQuery = computed(() => ({ q: appliedSearch.value, filter: filter.value, page: chapterPage.value }))
const overviewRequest = useFetch<any>(`${base}/overview`)
const chapterRequest = useFetch<any>(`${base}/chapters`, { query: chapterQuery })
const { data: novel, error: novelError, refresh: refreshOverview } = overviewRequest
const { data: chapterData, pending: chapterPending, error: chapterError, refresh: refreshChapters } = chapterRequest
await Promise.all([overviewRequest, chapterRequest])
const chapterResult = shallowRef<any>(chapterData.value)
watch(chapterData, (value: any) => { if (value) chapterResult.value = value })
const chapters = computed<any[]>(() => chapterResult.value?.items || [])
const selectedDetails = shallowRef<Record<string, any>>({})
watch(chapters, (items: any[]) => { selectedDetails.value = { ...selectedDetails.value, ...Object.fromEntries(items.filter(x => x.id).map(x => [x.id, x])) } }, { immediate: true })
const selecting = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(chapterSearch, (value: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { chapterPage.value = 1; appliedSearch.value = value.trim() }, 350)
})
watch(filter, () => { chapterPage.value = 1 })
function changeChapterPage(page: number) {
  if (chapterPending.value) return
  chapterPage.value = Math.max(1, Math.min(chapterResult.value?.pageCount || 1, page))
  document.getElementById('chapters')?.scrollIntoView({ block: 'start' })
}
const queuing = ref(false)
const translateMenu = ref<HTMLDetailsElement | null>(null)
const notice = ref('')
const selected = ref<string[]>([])
const selectionAnchor = ref('')
const downloading = ref(false)
const downloadingChapter = ref('')
const openingChapter = ref('')
const syncing = ref(false)
const scheduleBusy = ref(false)
const dictionaryBusy = ref(false)
const dictionaryRepairBusy = ref(false)
const dictionaryOpen = ref(false)
const dictionaryType = ref<'CHARACTER' | 'PLACE'>('CHARACTER')
const dictionarySearch = ref('')
const dictionaryShowAll = ref(false)
const expandedDictionaryEntries = ref<string[]>([])
const visualBusy = ref('')
const skinProfileId = ref('')
const selectedSkinIds = ref<string[]>([])
const referenceRequest = useLazyFetch<any>(`${base}/reference`, { server: false, immediate: false, watch: false })
const { data: reference, pending: referencePending, error: referenceError } = referenceRequest
const activeSkinProfile = computed(() => (reference.value?.characterVisuals || []).find((profile: any) => profile.id === skinProfileId.value) || null)
let visualPoller: ReturnType<typeof setInterval> | undefined
let directoryTimer: ReturnType<typeof setTimeout> | undefined
let mounted = false, polling = false, referenceVersion = '', directoryAttempts = 0
const directoryChecking = ref(false), directoryError = ref('')
async function refreshReference() {
  const status = await $fetch<any>(`${base}/reference-status`)
  await referenceRequest.execute()
  if (!referenceError.value) referenceVersion = status.version
}
async function refresh() {
  await Promise.all([refreshOverview(), refreshChapters()])
}
async function refreshDirectory(force = false) {
  if (!mounted) return
  if (directoryTimer) clearTimeout(directoryTimer)
  if (force) directoryAttempts = 0
  directoryChecking.value = true
  try {
    const state = await $fetch<any>(`${base}/directory`, { query: force ? { force: '1' } : {} })
    if (!mounted) return
    directoryError.value = state.error
    if (state.refreshing && ++directoryAttempts < 30) directoryTimer = setTimeout(() => void refreshDirectory(), 2000)
    else {
      directoryChecking.value = false
      if (state.refreshing) directoryError.value = 'TWKAN is taking longer than usual. Local chapters are ready to read.'
      if (!state.refreshing && !state.error) await refreshChapters()
    }
  } catch { directoryChecking.value = false; directoryError.value = 'Could not check TWKAN. Local chapters are still available.' }
}
onMounted(() => {
  mounted = true
  try { dictionaryOpen.value = localStorage.getItem(`inkrail-dictionary-open:${route.params.slug}`) === 'true' } catch { /* Storage may be disabled. */ }
  void refreshDirectory()
  visualPoller = setInterval(async () => {
    if (!dictionaryOpen.value || document.hidden || polling || referencePending.value) return
    polling = true
    try {
      const status = await $fetch<any>(`${base}/reference-status`)
      if (mounted && dictionaryOpen.value && status.version !== referenceVersion) { await referenceRequest.execute(); if (!referenceError.value) referenceVersion = status.version }
    } catch { /* Retry the small status request on the next interval. */ }
    finally { polling = false }
  }, 3000)
})
onBeforeUnmount(() => { mounted = false; if (visualPoller) clearInterval(visualPoller); if (searchTimer) clearTimeout(searchTimer); if (directoryTimer) clearTimeout(directoryTimer) })
watch(dictionaryOpen, (value: boolean) => {
  if (!import.meta.client) return
  try { localStorage.setItem(`inkrail-dictionary-open:${route.params.slug}`, String(value)) } catch { /* Storage may be disabled. */ }
  if (value) void refreshReference().catch(() => { notice.value = 'Could not load the dictionary. Please retry.' })
})

async function updateDictionary() {
  if (!novel.value || dictionaryBusy.value) return
  dictionaryBusy.value = true; notice.value = ''
  try {
    const result: any = await $fetch('/api/encyclopedia/infer', { method: 'POST', body: { novelId: novel.value.id } })
    notice.value = result.queued
      ? `${result.queued} downloaded chapter${result.queued === 1 ? '' : 's'} queued for dictionary scanning before translation.`
      : 'The dictionary is already current for all downloaded chapters.'
  } catch (cause: any) {
    notice.value = cause?.data?.statusMessage || cause?.message || 'Dictionary inference could not be queued.'
  } finally { dictionaryBusy.value = false }
}

async function repairDictionaryAndTranslations() {
  if (!novel.value || dictionaryRepairBusy.value) return
  dictionaryRepairBusy.value = true; notice.value = ''
  try {
    await $fetch('/api/encyclopedia/reconcile', { method: 'POST', body: { novelId: novel.value.id, repairTranslations: true } })
    notice.value = `Dictionary cleanup queued through chapter ${novel.value.readingProgress?.chapter.position || 0}. Translation repairs will queue only after it finishes.`
  } catch (cause: any) {
    notice.value = cause?.data?.statusMessage || cause?.message || 'Dictionary cleanup could not be queued.'
  } finally { dictionaryRepairBusy.value = false }
}

const dictionaryCounts = computed(() => reference.value ? {
  CHARACTER: reference.value.encyclopediaEntries.filter((entry: any) => entry.type === 'CHARACTER').length,
  PLACE: reference.value.encyclopediaEntries.filter((entry: any) => entry.type === 'PLACE').length
} : { CHARACTER: novel.value?.dictionaryCounts?.CHARACTER || 0, PLACE: novel.value?.dictionaryCounts?.PLACE || 0 })

const filteredDictionaryEntries = computed(() => {
  const query = dictionarySearch.value.trim().toLocaleLowerCase()
  return (reference.value?.encyclopediaEntries || [])
    .filter((entry: any) => entry.type === dictionaryType.value)
    .filter((entry: any) => !query || [entry.originalName, entry.translatedName, entry.description, ...(entry.aliases || [])]
      .some(value => String(value || '').toLocaleLowerCase().includes(query)))
    .sort((left: any, right: any) => right.lastPosition - left.lastPosition || left.firstPosition - right.firstPosition)
})
const visibleDictionaryEntries = computed(() => dictionaryShowAll.value || dictionarySearch.value ? filteredDictionaryEntries.value : filteredDictionaryEntries.value.slice(0, 10))

function toggleDictionaryEntry(id: string) {
  expandedDictionaryEntries.value = expandedDictionaryEntries.value.includes(id)
    ? expandedDictionaryEntries.value.filter((entryId: string) => entryId !== id)
    : [...expandedDictionaryEntries.value, id]
}

async function refreshCharacterVisuals() {
  if (!novel.value || visualBusy.value) return
  visualBusy.value = 'refresh'; notice.value = ''
  try {
    await $fetch('/api/character-visuals/refresh', { method: 'POST', body: { novelId: novel.value.id } })
    await refreshReference()
    notice.value = 'Main-character candidates refreshed through your reading progress.'
  } catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not refresh character candidates.' }
  finally { visualBusy.value = '' }
}

async function generateCharacter(entryId: string) {
  visualBusy.value = entryId; notice.value = ''
  try {
    await $fetch(`/api/character-visuals/${entryId}/generate`, { method: 'POST' })
    await refreshReference()
    notice.value = 'Character art queued. The live work button will show generation progress.'
  } catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not queue character art.' }
  finally { visualBusy.value = '' }
}

async function approveSkin(id: string) {
  visualBusy.value = id
  try { await $fetch(`/api/character-visuals/skins/${id}/approve`, { method: 'POST' }); await refreshReference(); notice.value = 'Character skin approved for spoiler-safe reader popovers.' }
  catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not approve this skin.' }
  finally { visualBusy.value = '' }
}

function openSkinTimeline(profile: any) {
  skinProfileId.value = profile.id
  selectedSkinIds.value = []
}

async function detectSkins(entryId: string) {
  visualBusy.value = `detect:${entryId}`; notice.value = ''
  try { await $fetch(`/api/character-visuals/${entryId}/detect`, { method: 'POST' }); await refreshReference(); notice.value = 'Skin detection queued. Future descriptions stay hidden until your progress unlocks them.' }
  catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not queue skin detection.' }
  finally { visualBusy.value = '' }
}

function toggleSkinSelection(id: string) {
  selectedSkinIds.value = selectedSkinIds.value.includes(id) ? selectedSkinIds.value.filter((item: string) => item !== id) : [...selectedSkinIds.value, id]
}

async function generateSkins(scope: 'selected' | 'all' | 'unlocked') {
  const profile = activeSkinProfile.value
  if (!profile || (scope === 'selected' && !selectedSkinIds.value.length)) return
  visualBusy.value = `generate:${scope}`; notice.value = ''
  try {
    const result: any = await $fetch('/api/character-visuals/generate', { method: 'POST', body: scope === 'selected' ? { skinIds: selectedSkinIds.value, scope } : { entryId: profile.entryId, scope } })
    selectedSkinIds.value = []; await refreshReference(); notice.value = `${result.queued} skin${result.queued === 1 ? '' : 's'} queued for image generation.`
  } catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not queue the selected skins.' }
  finally { visualBusy.value = '' }
}

async function setSkinDismissed(id: string, dismissed: boolean) {
  visualBusy.value = id
  try { await $fetch(`/api/character-visuals/skins/${id}`, { method: 'PATCH' as any, body: { action: dismissed ? 'dismiss' : 'restore' } }); await refreshReference() }
  catch (cause: any) { notice.value = cause?.data?.statusMessage || cause?.message || 'Could not update this skin.' }
  finally { visualBusy.value = '' }
}

const translationStatus = (chapter: any) => chapter?.translations?.[0]?.status || 'NOT_STARTED'
const canTranslate = (chapter: any) => chapter?.scrapeStatus === 'COMPLETED' && ['NOT_STARTED', 'FAILED', 'SOURCE_CHANGED'].includes(translationStatus(chapter))
const canCancel = (chapter: any) => ['QUEUED', 'TRANSLATING'].includes(translationStatus(chapter))
const canSelect = (chapter: any) => Boolean(chapter.id) && (canTranslate(chapter) || canCancel(chapter))


async function syncChapters() {
  if (!novel.value || syncing.value) return
  syncing.value = true; notice.value = ''
  try {
    const result: any = await $fetch(`/api/novels/${novel.value.id}/sync`, { method: 'POST' })
    notice.value = result.added
      ? `Found ${result.added} new chapter${result.added === 1 ? '' : 's'}; ${result.queued} queued for download.`
      : `Chapter list is up to date (${result.total} entries).`
    await refresh(); await refreshDirectory(true)
  } catch (cause: any) {
    notice.value = cause?.data?.statusMessage || cause?.message || 'Chapter sync failed.'
  } finally { syncing.value = false }
}

async function addDailySchedule() {
  if (!novel.value || scheduleBusy.value) return
  scheduleBusy.value = true; notice.value = ''
  try {
    const result: any = await $fetch('/api/schedules', { method: 'POST', body: { novelId: novel.value.id, localTime: '06:00' } })
    notice.value = `Daily sync scheduled. First run ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(result.nextRunAt))}.`
    await refresh()
  } catch (cause: any) {
    notice.value = cause?.data?.statusMessage || cause?.message || 'Could not add the daily schedule.'
  } finally { scheduleBusy.value = false }
}

async function downloadChapters(sourceChapterIds?: string[]) {
  if (!novel.value) return
  downloading.value = !sourceChapterIds
  downloadingChapter.value = sourceChapterIds?.[0] || ''
  try {
    const result: any = await $fetch(`/api/downloads/${novel.value.sourceSite}`, { method: 'POST', body: { sourceNovelId: novel.value.sourceNovelId, sourceChapterIds } })
    notice.value = result.queued ? `${result.queued} chapter${result.queued === 1 ? '' : 's'} queued for download.` : 'Those chapters are already downloaded or queued.'
    await refresh(); await refreshDirectory(true)
  } finally { downloading.value = false; downloadingChapter.value = '' }
}

async function openChapter(chapter: any) {
  if (chapter.id && chapter.scrapeStatus === 'COMPLETED') return navigateTo(`/novels/${novel.value.slug}/chapters/${chapter.id}`)
  openingChapter.value = chapter.sourceChapterId
  try {
    const result: any = await $fetch(`/api/downloads/${novel.value.sourceSite}`, { method: 'POST', body: { sourceNovelId: novel.value.sourceNovelId, sourceChapterIds: [chapter.sourceChapterId] } })
    const local = result.chapters?.find((item: any) => item.sourceChapterId === chapter.sourceChapterId)
    if (!local?.id) throw new Error('Chapter could not be indexed')
    await navigateTo(`/novels/${novel.value.slug}/chapters/${local.id}`)
  } finally { openingChapter.value = '' }
}

async function queueTranslations(chapterIds?: string[], scope: 'all' | 'recent' = 'all') {
  if (!novel.value || (chapterIds && !chapterIds.length)) return
  queuing.value = true
  try {
    const result: any = await $fetch('/api/translations/queue', { method: 'POST', body: { novelId: novel.value.id, chapterIds, scope } })
    const boundary = scope === 'recent' ? ` from chapter ${novel.value.readingProgress?.chapter.position} onward` : ''
    notice.value = result.queued ? `${result.queued} chapter${result.queued === 1 ? '' : 's'}${boundary} queued for Codex CLI.` : `No eligible chapters${boundary} are waiting.`
    clearSelection()
    await refresh()
  } catch (cause: any) {
    notice.value = cause?.data?.statusMessage || cause?.message || 'Translations could not be queued.'
  } finally {
    queuing.value = false
    if (translateMenu.value) translateMenu.value.open = false
  }
}

async function cancelTranslations(chapterIds: string[]) {
  if (!chapterIds.length) return
  queuing.value = true
  try {
    const result: any = await $fetch('/api/translations/cancel', { method: 'POST', body: { chapterIds } })
    notice.value = `${result.canceled} queued translation${result.canceled === 1 ? '' : 's'} canceled${result.cancellationRequested ? `; stopping ${result.cancellationRequested} active translation` : ''}.`
    clearSelection()
    await refresh()
  } finally { queuing.value = false }
}

function clearSelection() {
  selected.value = []
  selectionAnchor.value = ''
}

function toggleChapter(id: string, event: MouseEvent) {
  const checkbox = event.currentTarget as HTMLInputElement
  const shouldSelect = checkbox.checked
  const anchorIndex = chapters.value.findIndex((chapter: any) => chapter.id === selectionAnchor.value)
  const targetIndex = chapters.value.findIndex((chapter: any) => chapter.id === id)
  const next = new Set(selected.value)

  if (event.shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
    const start = Math.min(anchorIndex, targetIndex)
    const end = Math.max(anchorIndex, targetIndex)
    for (const chapter of chapters.value.slice(start, end + 1)) {
      if (!canSelect(chapter)) continue
      if (shouldSelect) next.add(chapter.id)
      else next.delete(chapter.id)
    }
  } else if (shouldSelect) next.add(id)
  else next.delete(id)

  selected.value = [...next]
  selectionAnchor.value = id
}

async function selectWaiting() {
  selecting.value = true
  const key = JSON.stringify(chapterQuery.value)
  try {
    const result = await $fetch<any>(`${base}/chapters`, { query: { ...chapterQuery.value, selection: 'waiting' } })
    if (key !== JSON.stringify(chapterQuery.value)) return
    selectedDetails.value = { ...selectedDetails.value, ...Object.fromEntries(result.items.map((x: any) => [x.id, x])) }
    selected.value = result.items.map((x: any) => x.id)
    selectionAnchor.value = ''
  } catch { notice.value = 'Could not select matching chapters. Please retry.' }
  finally { selecting.value = false }
}
const selectedSet = computed(() => new Set(selected.value))

const visibleSelectable = computed(() => chapters.value.filter(canSelect).map((chapter: any) => chapter.id))
const allVisibleSelected = computed(() => visibleSelectable.value.length > 0 && visibleSelectable.value.every((id: string) => selectedSet.value.has(id)))

function toggleVisibleSelection() {
  const deselecting = allVisibleSelected.value
  const next = new Set(selected.value)
  if (deselecting) visibleSelectable.value.forEach((id: string) => next.delete(id))
  else visibleSelectable.value.forEach((id: string) => next.add(id))
  selected.value = [...next]
  selectionAnchor.value = deselecting ? '' : visibleSelectable.value.at(-1) || ''
}

const selectedTranslatable = computed(() => selected.value.filter((id: string) => canTranslate(selectedDetails.value[id])))
const selectedCancelable = computed(() => selected.value.filter((id: string) => canCancel(selectedDetails.value[id])))

function statusClass(status: string) {
  if (['TRANSLATED', 'APPROVED'].includes(status)) return 'badge-good'
  if (['NEEDS_REVIEW', 'SOURCE_CHANGED'].includes(status)) return 'badge-warn'
  if (status === 'FAILED') return 'badge-bad'
  if (['QUEUED', 'TRANSLATING'].includes(status)) return 'badge-warn'
  return 'badge-muted'
}
</script>

<template>
  <div v-if="novelError" role="alert" class="px-5 py-20 text-center">Could not open this novel. <button class="btn btn-primary" @click="refreshOverview()">Retry</button></div>
  <div v-else-if="novel" class="mx-auto max-w-7xl px-5 pt-10 pb-[calc(8rem+env(safe-area-inset-bottom))] md:pt-14">
    <LibraryBreadcrumbs :title="novel.titleTranslated || novel.titleOriginal" :library="novel.libraryEntries?.[0]?.library" media="NOVEL" />
    <section class="grid gap-8 lg:grid-cols-[220px_1fr]">
      <div class="mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl bg-gradient-to-br from-moss to-ink shadow-2xl lg:mx-0 lg:w-full"><img :src="`/api/novels/${novel.id}/cover`" :alt="novel.titleOriginal" class="h-full w-full object-cover" /></div>
      <div class="flex flex-col justify-center">
        <div class="flex flex-wrap gap-2"><span class="badge badge-muted">{{ novel.category || 'Novel' }}</span><span class="badge badge-good">{{ novel.sourceStatus }}</span><span class="badge badge-muted">{{ novel.sourceLanguage }}</span></div>
        <h1 class="mt-5 font-serif text-4xl font-semibold leading-tight md:text-6xl">{{ novel.titleTranslated || novel.titleOriginal }}</h1>
        <p v-if="novel.titleTranslated" class="mt-2 font-serif text-xl text-white/45">{{ novel.titleOriginal }}</p>
        <p class="mt-4 text-sm text-white/45">{{ novel.author }} · {{ novel.wordCountLabel }}</p>
        <p class="mt-6 max-w-4xl text-sm leading-7 text-white/55">{{ novel.description }}</p>
        <div class="mt-7 flex flex-wrap gap-3">
          <NuxtLink v-if="novel.readingProgress" :to="`/novels/${novel.slug}/chapters/${novel.readingProgress.chapterId}`" class="btn btn-primary">Continue chapter {{ novel.readingProgress.chapter.position }}</NuxtLink>
          <NuxtLink v-else-if="novel.firstChapter" :to="`/novels/${novel.slug}/chapters/${novel.firstChapter.id}`" class="btn btn-primary">Start reading</NuxtLink>
          <a href="#chapters" class="btn btn-quiet">Choose chapters</a>
          <NuxtLink :to="`/sources/${novel.sourceSite}/books/${encodeURIComponent(novel.sourceNovelId)}`" class="btn btn-quiet">View source</NuxtLink>
          <NuxtLink v-if="novel.syncSchedule" to="/schedules" class="btn btn-quiet">Daily sync {{ novel.syncSchedule.enabled ? 'scheduled' : 'paused' }}</NuxtLink>
          <button v-else class="btn btn-quiet" :disabled="scheduleBusy" @click="addDailySchedule">{{ scheduleBusy ? 'Scheduling…' : 'Schedule daily sync' }}</button>
        </div>
        <p v-if="notice" class="mt-4 text-sm text-gold">{{ notice }}</p>
      </div>
    </section>

    <section class="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/[.025]">
      <button type="button" class="flex w-full items-center justify-between gap-5 p-5 text-left sm:p-7" :aria-expanded="dictionaryOpen" @click="dictionaryOpen = !dictionaryOpen">
        <div><p class="text-xs uppercase tracking-[.2em] text-gold/70">Spoiler-safe reference</p><h2 class="mt-2 font-serif text-2xl font-semibold sm:text-3xl">Characters & places</h2><p class="mt-2 text-xs text-white/40">{{ dictionaryCounts.CHARACTER }} characters · {{ dictionaryCounts.PLACE }} places · through chapter {{ novel.readingProgress?.chapter.position || 0 }}</p></div>
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-lg text-white/55 transition" :class="dictionaryOpen ? 'rotate-180' : ''">⌄</span>
      </button>
      <div v-if="dictionaryOpen" class="border-t border-white/8 p-5 sm:p-7">
        <p v-if="referencePending" role="status" class="mb-4 text-sm text-white/45">Loading reference…</p>
        <p v-if="referenceError" role="alert" class="mb-4 text-sm text-[#efa58b]">Could not load reference. <button class="underline" @click="refreshReference()">Retry</button></p>
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p class="max-w-2xl text-sm leading-6 text-white/45">The full downloaded-novel dictionary runs before translation to keep names and character identities consistent. This reference view only shows details through your reading progress.</p>
          <div class="flex flex-wrap gap-2"><button class="btn btn-quiet py-2" :disabled="dictionaryBusy" @click="updateDictionary">{{ dictionaryBusy ? 'Queueing…' : 'Scan all downloaded chapters' }}</button><button class="btn btn-quiet py-2" :disabled="dictionaryRepairBusy" @click="repairDictionaryAndTranslations">{{ dictionaryRepairBusy ? 'Queueing…' : 'Repair names & translations' }}</button></div>
        </div>
        <section class="mt-5 rounded-2xl border border-white/8 bg-black/10 p-4">
          <div class="flex items-center justify-between gap-3"><div><h3 class="font-serif text-xl font-semibold">Main character art</h3><p class="mt-1 text-xs text-white/40">Candidates and skins unlock only through chapter {{ novel.readingProgress?.chapter.position || 0 }}.</p></div><button class="btn btn-quiet shrink-0 px-3 py-2 text-xs" :disabled="Boolean(visualBusy)" @click="refreshCharacterVisuals">{{ visualBusy === 'refresh' ? 'Scoring…' : 'Refresh' }}</button></div>
          <div v-if="reference?.characterVisuals?.length" class="mt-4 grid max-h-[32rem] gap-3 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">
            <article v-for="profile in reference?.characterVisuals" :key="profile.id" class="flex min-w-0 flex-wrap gap-3 rounded-xl border border-white/8 p-3">
              <div class="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5"><img v-if="profile.skins.find((skin: any) => skin.imageUrl)" :src="profile.skins.find((skin: any) => skin.imageUrl).imageUrl" :alt="profile.name" loading="lazy" decoding="async" class="h-full w-full object-cover" /><span v-else class="grid h-full place-items-center font-serif text-2xl text-white/25">{{ profile.name.slice(0, 1) }}</span></div>
              <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><h4 class="truncate font-semibold">{{ profile.name }}</h4><span class="badge badge-muted text-[9px]">{{ profile.status.replaceAll('_', ' ') }}</span></div><p class="mt-1 text-xs text-white/35">{{ profile.originalName }} · {{ profile.mentionedChapterCount }} chapters</p><p v-if="profile.visualIdentity" class="mt-1 line-clamp-2 text-[10px] leading-4 text-white/30">Source-grounded identity; unspecified colors remain artistic interpretation.</p>
                <div class="mt-2 flex flex-wrap gap-3"><button class="text-xs font-semibold text-gold" @click="openSkinTimeline(profile)">Skins ({{ profile.skins.filter((skin: any) => skin.status !== 'DISMISSED').length }})</button><button v-if="!profile.skins.length && !['QUEUED','GENERATING'].includes(profile.status)" class="text-xs font-semibold text-white/55 disabled:opacity-40" :disabled="Boolean(visualBusy)" @click="generateCharacter(profile.entryId)">Generate avatar</button><span v-else-if="['QUEUED','GENERATING'].includes(profile.status)" class="text-xs text-gold">{{ profile.status === 'GENERATING' ? 'Generating…' : 'Queued…' }}</span></div>
              </div>
              <details v-if="profile.skins.find((skin: any) => skin.fullBodyImageUrl)" class="group basis-full border-t border-white/8 pt-2"><summary class="cursor-pointer list-none text-center text-[11px] font-semibold text-white/45 hover:text-white/70"><span class="group-open:hidden">Preview full body</span><span class="hidden group-open:inline">Hide full body</span></summary><img :src="profile.skins.find((skin: any) => skin.fullBodyImageUrl).fullBodyImageUrl" :alt="`Full-body view of ${profile.name}`" class="mx-auto mt-3 max-h-96 w-auto rounded-xl object-contain" /></details>
            </article>
          </div>
          <p v-else class="mt-4 text-xs text-white/35">Refresh after the dictionary has identified recurring characters.</p>
        </section>
        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
          <div class="flex shrink-0 rounded-xl border border-white/10 p-1 text-xs"><button v-for="type in ['CHARACTER','PLACE']" :key="type" class="rounded-lg px-3 py-2" :class="dictionaryType === type ? 'bg-white/10 text-white' : 'text-white/40'" @click="dictionaryType = type as any; dictionaryShowAll = false">{{ type === 'CHARACTER' ? `Characters (${dictionaryCounts.CHARACTER})` : `Places (${dictionaryCounts.PLACE})` }}</button></div>
          <input v-model="dictionarySearch" type="search" class="field py-2 text-sm" placeholder="Search names, Chinese aliases, or descriptions…" aria-label="Search dictionary" />
        </div>
        <div v-if="visibleDictionaryEntries.length" class="mt-5 space-y-2">
          <article v-for="entry in visibleDictionaryEntries" :key="entry.id" class="overflow-hidden rounded-2xl border border-white/8 bg-black/10">
            <button type="button" class="flex w-full items-center gap-3 p-4 text-left" :aria-expanded="expandedDictionaryEntries.includes(entry.id)" @click="toggleDictionaryEntry(entry.id)">
              <div class="min-w-0 flex-1"><div class="flex min-w-0 items-baseline gap-2"><h3 class="truncate font-serif text-lg font-semibold">{{ entry.translatedName || entry.originalName }}</h3><span v-if="entry.nameCollision" class="badge badge-warn shrink-0">same name</span></div><p class="truncate text-xs text-white/35">{{ entry.originalName }} · last seen chapter {{ entry.lastPosition }}</p></div><span class="text-white/35">{{ expandedDictionaryEntries.includes(entry.id) ? '−' : '+' }}</span>
            </button>
            <div v-if="expandedDictionaryEntries.includes(entry.id)" class="border-t border-white/8 px-4 pb-4 pt-3"><p class="text-sm leading-6 text-white/60">{{ entry.description }}</p><p v-if="entry.physicalDescription" class="mt-3 text-sm leading-6 text-white/60"><span class="text-white/80">Appearance · </span>{{ entry.physicalDescription }}</p><p v-if="entry.aliases?.filter((alias: string) => ![entry.originalName, entry.translatedName].includes(alias)).length" class="mt-3 text-xs leading-5 text-white/35">Aliases · {{ entry.aliases.filter((alias: string) => ![entry.originalName, entry.translatedName].includes(alias)).join(', ') }}</p><p class="mt-3 text-[10px] uppercase tracking-[.12em] text-white/25">First seen · chapter {{ entry.firstPosition }}</p></div>
          </article>
          <button v-if="!dictionarySearch && filteredDictionaryEntries.length > 10" class="btn btn-quiet mt-3 w-full py-2" @click="dictionaryShowAll = !dictionaryShowAll">{{ dictionaryShowAll ? 'Show recent only' : `Show all ${filteredDictionaryEntries.length}` }}</button>
        </div>
        <p v-else class="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/35">{{ dictionarySearch ? 'No dictionary entries match this search.' : 'No spoiler-safe entries are known at this reading position yet.' }}</p>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="activeSkinProfile" class="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" @click.self="skinProfileId = ''">
        <section class="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#171915] shadow-2xl sm:rounded-3xl">
          <header class="flex items-start justify-between gap-4 border-b border-white/8 p-4 sm:p-6">
            <div class="min-w-0"><p class="text-[10px] uppercase tracking-[.2em] text-gold/65">Character skins</p><h2 class="mt-1 truncate font-serif text-2xl font-semibold">{{ activeSkinProfile.name }}</h2><p class="mt-1 text-xs text-white/40">Generated skins are enabled automatically. Future details unlock with your reading progress.</p></div>
            <button class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/55" aria-label="Close skin timeline" @click="skinProfileId = ''">×</button>
          </header>
          <div class="flex flex-wrap gap-2 border-b border-white/8 p-3 sm:px-6">
            <button class="btn btn-quiet px-3 py-2 text-xs" :disabled="Boolean(visualBusy) || ['QUEUED','RUNNING'].includes(activeSkinProfile.skinDetectionStatus)" @click="detectSkins(activeSkinProfile.entryId)">{{ ['QUEUED','RUNNING'].includes(activeSkinProfile.skinDetectionStatus) ? 'Detecting…' : activeSkinProfile.skinDetectedAt ? 'Rescan source' : 'Detect skins' }}</button>
            <button class="btn btn-primary px-3 py-2 text-xs" :disabled="Boolean(visualBusy) || !selectedSkinIds.length" @click="generateSkins('selected')">Generate selected ({{ selectedSkinIds.length }})</button>
            <button class="btn btn-quiet px-3 py-2 text-xs" :disabled="Boolean(visualBusy)" @click="generateSkins('unlocked')">Generate unlocked</button>
            <button class="btn btn-quiet px-3 py-2 text-xs" :disabled="Boolean(visualBusy)" @click="generateSkins('all')">Generate all</button>
          </div>
          <p v-if="activeSkinProfile.skinDetectionError" class="mx-4 mt-3 rounded-xl bg-red-400/10 p-3 text-xs text-red-200 sm:mx-6">{{ activeSkinProfile.skinDetectionError }}</p>
          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
            <article v-for="skin in activeSkinProfile.skins" :key="skin.id" class="relative overflow-hidden rounded-2xl border p-3" :class="skin.locked ? 'border-white/6 bg-white/[.02]' : skin.status === 'DISMISSED' ? 'border-white/5 opacity-50' : 'border-white/10 bg-white/[.025]'">
              <div v-if="skin.locked" class="flex min-h-24 items-center gap-3">
                <input v-if="['PROPOSED','FAILED'].includes(skin.status)" type="checkbox" class="h-4 w-4 accent-[#d4a85f]" :checked="selectedSkinIds.includes(skin.id)" :aria-label="`Select locked skin at chapter ${skin.introducedAtPosition}`" @change="toggleSkinSelection(skin.id)" />
                <div class="grid h-20 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-white/10 to-white/[.025] text-2xl blur-[1px]">🔒</div>
                <div><h3 class="font-semibold text-white/60">Locked skin</h3><p class="mt-1 text-xs text-white/35">Unlocks at chapter {{ skin.introducedAtPosition }}</p><span class="badge badge-muted mt-2 text-[9px]">{{ skin.status.replaceAll('_', ' ') }}</span></div>
              </div>
              <div v-else class="flex items-start gap-3">
                <input v-if="['PROPOSED','FAILED'].includes(skin.status)" type="checkbox" class="mt-8 h-4 w-4 accent-[#d4a85f]" :checked="selectedSkinIds.includes(skin.id)" :aria-label="`Select ${skin.name}`" @change="toggleSkinSelection(skin.id)" />
                <div class="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5"><img v-if="skin.imageUrl" :src="skin.imageUrl" :alt="skin.name" loading="lazy" decoding="async" class="h-full w-full object-cover" /><span v-else class="grid h-full place-items-center text-2xl text-white/20">◇</span></div>
                <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="font-semibold">{{ skin.name }}</h3><span class="badge badge-muted text-[9px]">{{ skin.status.replaceAll('_', ' ') }}</span></div><p class="mt-1 text-[10px] uppercase tracking-[.12em] text-white/30">Chapter {{ skin.introducedAtPosition }} · {{ skin.changeType?.replaceAll('_', ' ') }}</p><p class="mt-2 text-sm leading-5 text-white/55">{{ skin.description || 'No description yet.' }}</p><div class="mt-3 flex flex-wrap gap-3"><button v-if="!['QUEUED','GENERATING','DISMISSED'].includes(skin.status)" class="text-xs text-[#efa58b] hover:text-white" :disabled="Boolean(visualBusy)" @click="setSkinDismissed(skin.id, true)">Remove skin</button><button v-if="skin.status === 'DISMISSED'" class="text-xs text-white/45 hover:text-white" :disabled="Boolean(visualBusy)" @click="setSkinDismissed(skin.id, false)">Restore</button><a v-if="skin.fullBodyImageUrl" :href="skin.fullBodyImageUrl" target="_blank" class="text-xs text-gold">Full body</a></div></div>
              </div>
            </article>
            <p v-if="!activeSkinProfile.skins.length" class="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/35">No skins yet. Detect visual changes from the downloaded Chinese source.</p>
          </div>
        </section>
      </div>
    </Teleport>

    <section id="chapters" class="mt-14 scroll-mt-24">
      <div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p class="text-xs uppercase tracking-[.2em] text-white/35">Directory</p><h2 class="mt-2 font-serif text-3xl font-semibold">{{ chapterResult?.directoryCount ?? novel.chapterCount }} entries</h2><p class="mt-2 text-xs text-white/35">{{ chapterResult?.localCount ?? novel.chapterCount }} indexed locally</p></div>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:items-end"><div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"><button class="btn btn-quiet w-full px-3 text-sm sm:w-auto" :disabled="syncing" @click="syncChapters">{{ syncing ? 'Syncing…' : 'Sync & download new' }}</button><details ref="translateMenu" class="group relative"><summary class="btn btn-primary flex w-full cursor-pointer list-none items-center justify-center gap-2 px-3 text-sm sm:w-auto" :class="queuing ? 'pointer-events-none opacity-50' : ''"><span>{{ queuing ? 'Queueing…' : 'Translate' }}</span><span class="text-[10px] transition-transform group-open:rotate-180">▼</span></summary><div class="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#20231e] p-1.5 shadow-2xl"><button class="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[.06]" @click="queueTranslations(undefined, 'all')"><span class="block font-semibold">All untranslated</span><span class="mt-0.5 block text-xs text-white/40">Every downloaded chapter</span></button><button class="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-35" :disabled="!novel.readingProgress" @click="queueTranslations(undefined, 'recent')"><span class="block font-semibold">Recent only</span><span class="mt-0.5 block text-xs text-white/40">{{ novel.readingProgress ? `Chapter ${novel.readingProgress.chapter.position} onward` : 'Start reading to set the boundary' }}</span></button></div></details><button class="btn btn-quiet col-span-2 w-full px-3 text-sm sm:col-auto sm:w-auto" :disabled="downloading" @click="downloadChapters()">{{ downloading ? 'Indexing…' : 'Download all' }}</button></div><div class="flex self-end rounded-xl border border-white/10 p-1 text-xs">
          <button v-for="option in ['all','ready','untranslated']" :key="option" class="rounded-lg px-3 py-2 capitalize" :class="filter === option ? 'bg-white/10 text-white' : 'text-white/40'" @click="filter = option as any">{{ option }}</button>
        </div></div>
      </div>
      <div class="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-3 py-2.5 focus-within:border-gold/40">
        <span class="text-sm text-white/30">⌕</span>
        <input v-model="chapterSearch" type="search" class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" placeholder="Search chapter number or title…" aria-label="Search chapters" />
        <span v-if="chapterSearch" class="shrink-0 text-[10px] text-white/35">{{ chapterResult?.total ?? 0 }} found</span>
        <button v-if="chapterSearch" class="shrink-0 px-1 text-xs text-white/45 hover:text-white" aria-label="Clear chapter search" @click="chapterSearch = ''">Clear</button>
      </div>
      <div class="sticky top-[99px] z-20 mb-3 rounded-lg border border-white/10 bg-[#171915]/95 p-1.5 shadow-xl backdrop-blur-xl sm:hidden">
        <div class="flex min-w-0 items-center gap-1">
          <span class="min-w-0 flex-1 truncate px-1 text-[10px] text-white/40">{{ selected.length ? `${selected.length} selected · ${selectedTranslatable.length} ready` : 'Shift-click for a range' }}</span>
          <button class="rounded-md border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-white/65 disabled:opacity-30" :disabled="chapterPending || Boolean(chapterError) || !visibleSelectable.length" @click="toggleVisibleSelection">{{ allVisibleSelected ? 'None' : 'Visible' }}</button>
          <button class="rounded-md border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-white/65" :disabled="selecting || chapterPending || Boolean(chapterError)" @click="selectWaiting">Waiting</button>
          <button v-if="selected.length" class="px-1.5 py-1 text-[10px] text-white/50" @click="clearSelection">Clear</button>
        </div>
        <div v-if="selected.length" class="mt-1 grid grid-cols-2 gap-1">
          <button class="rounded-md bg-gold px-2 py-1.5 text-[11px] font-semibold text-ink disabled:opacity-35" :disabled="queuing || !selectedTranslatable.length" @click="queueTranslations(selectedTranslatable)">Translate ({{ selectedTranslatable.length }})</button>
          <button class="rounded-md border border-white/10 bg-white/[.04] px-2 py-1.5 text-[11px] font-semibold disabled:opacity-35" :disabled="queuing || !selectedCancelable.length" @click="cancelTranslations(selectedCancelable)">Cancel ({{ selectedCancelable.length }})</button>
        </div>
      </div>
      <div class="sticky top-[77px] z-20 mb-4 hidden flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#171915]/95 p-3 shadow-xl backdrop-blur-xl sm:flex">
        <button class="btn btn-quiet" :disabled="chapterPending || Boolean(chapterError) || !visibleSelectable.length" @click="toggleVisibleSelection">{{ allVisibleSelected ? 'Deselect visible' : `Select visible (${visibleSelectable.length})` }}</button>
        <button class="btn btn-quiet" :disabled="selecting || chapterPending || Boolean(chapterError)" @click="selectWaiting">Select untranslated</button>
        <div class="flex min-w-[180px] flex-1 items-center gap-3 text-xs text-white/35">
          <span class="min-w-0 flex-1 truncate"><template v-if="selected.length">{{ selected.length }} selected · {{ selectedTranslatable.length }} ready · {{ selectedCancelable.length }} active</template><template v-else>Click a checkbox, then Shift-click another to select a range.</template></span>
          <button v-if="selected.length" class="shrink-0 text-white/55 hover:text-white" @click="clearSelection">Clear</button>
        </div>
        <button class="btn btn-primary" :disabled="queuing || !selectedTranslatable.length" @click="queueTranslations(selectedTranslatable)">Translate {{ selectedTranslatable.length || '' }} selected</button>
        <button class="btn btn-quiet" :disabled="queuing || !selectedCancelable.length" @click="cancelTranslations(selectedCancelable)">Cancel {{ selectedCancelable.length || '' }} selected</button>
      </div>
      <ChapterPagination placement="top" :page="chapterResult?.page || 1" :page-count="chapterResult?.pageCount || 1" :total="chapterResult?.total || 0" :pending="chapterPending || !chapterResult" @change="changeChapterPage" />
      <p v-if="directoryChecking" role="status" class="mb-3 text-xs text-white/40">Checking TWKAN for new chapters…</p>
      <p v-if="directoryError" class="mb-3 text-xs text-white/45">{{ directoryError }} <button class="text-gold underline" @click="refreshDirectory(true)">Retry source check</button></p>
      <p v-if="chapterError" role="alert" class="mb-3 text-sm text-[#efa58b]">Could not load chapters. <button class="underline" @click="refreshChapters()">Retry</button></p>
      <p v-if="chapterPending" role="status" class="mb-3 text-sm text-white/40">Loading chapters…</p>
      <p v-if="!chapters.length && !chapterPending && !chapterError" class="py-10 text-center text-white/40">{{ chapterSearch || filter !== 'all' ? 'No matching chapters.' : 'No chapters indexed yet.' }}</p>
      <div class="surface overflow-hidden rounded-2xl">
        <div v-for="chapter in chapters" data-chapter-row :key="chapter.sourceChapterId" class="grid grid-cols-[24px_48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/8 px-4 py-3.5 transition-colors last:border-0" :class="selectedSet.has(chapter.id) ? 'bg-gold/[.08] ring-1 ring-inset ring-gold/20' : 'hover:bg-white/[.025]'">
          <input type="checkbox" class="h-4 w-4 cursor-pointer accent-[#d4a85f] disabled:cursor-not-allowed disabled:opacity-25" :disabled="chapterPending || Boolean(chapterError) || !canSelect(chapter)" :checked="selectedSet.has(chapter.id)" :aria-label="`Select ${chapter.titleOriginal}`" @click="toggleChapter(chapter.id, $event)" />
          <span class="font-mono text-xs text-white/25">{{ String(chapter.position).padStart(3, '0') }}</span>
          <NuxtLink v-if="chapter.scrapeStatus === 'COMPLETED'" :to="`/novels/${novel.slug}/chapters/${chapter.id}`" class="group min-w-0"><div class="truncate text-sm font-medium group-hover:text-gold">{{ chapter.titleTranslated || chapter.titleOriginal }}</div><div v-if="chapter.titleTranslated" class="mt-1 truncate text-xs text-white/30">{{ chapter.titleOriginal }}</div></NuxtLink>
          <button v-else class="min-w-0 text-left" :disabled="openingChapter === chapter.sourceChapterId" @click="openChapter(chapter)"><div class="truncate text-sm text-white/45 hover:text-gold">{{ openingChapter === chapter.sourceChapterId ? 'Opening and downloading…' : chapter.titleOriginal }}</div></button>
          <div class="flex items-center gap-2">
            <button v-if="!chapter.id || ['FAILED','NOT_DOWNLOADED'].includes(chapter.scrapeStatus)" class="text-xs text-gold hover:text-white" :disabled="Boolean(downloadingChapter)" @click="downloadChapters([chapter.sourceChapterId])">{{ downloadingChapter === chapter.sourceChapterId ? 'Queueing…' : chapter.scrapeStatus === 'FAILED' ? 'Retry download' : 'Download' }}</button>
            <span v-else-if="['PENDING','DOWNLOADING'].includes(chapter.scrapeStatus)" class="text-xs text-white/35">{{ chapter.scrapeStatus === 'DOWNLOADING' ? 'Downloading…' : 'Queued' }}</span>
            <button v-else-if="canTranslate(chapter)" class="text-xs text-gold hover:text-white" :disabled="queuing" @click="queueTranslations([chapter.id])">Translate</button>
            <button v-else-if="canCancel(chapter)" class="text-xs text-[#efa58b] hover:text-white" :disabled="queuing" @click="cancelTranslations([chapter.id])">Cancel</button>
            <span class="badge" :class="statusClass(chapter.scrapeStatus === 'COMPLETED' ? translationStatus(chapter) : chapter.scrapeStatus)">{{ (chapter.scrapeStatus === 'COMPLETED' ? translationStatus(chapter) : chapter.scrapeStatus).replaceAll('_',' ') }}</span>
          </div>
        </div>
      </div>
      <ChapterPagination placement="bottom" :page="chapterResult?.page || 1" :page-count="chapterResult?.pageCount || 1" :total="chapterResult?.total || 0" :pending="chapterPending || !chapterResult" @change="changeChapterPage" />
    </section>
  </div>
</template>
