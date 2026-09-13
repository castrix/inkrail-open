<script setup lang="ts">
import type { ReaderEntity } from '~/shared/utils/encyclopedia'

const route = useRoute()
const chapterId = computed(() => String(route.params.chapter))
const { data: features } = await useFetch('/api/features')
const { data, error, pending, refresh } = await useFetch(() => `/api/chapters/${chapterId.value}`)
useHead({ title: () => data.value ? `${data.value.translation.title || data.value.source.title} — ${data.value.chapter.novel.titleOriginal} — Inkrail` : 'Chapter — Inkrail' })
const mode = ref<'translation' | 'source' | 'parallel'>('translation')
const theme = ref<'dark' | 'sepia' | 'light'>('dark')
const fontSize = ref(20)
const contentWidth = ref(760)
const translationBusy = ref(false)
const translationNotice = ref('')
const readerChromeVisible = ref(true)
const archiveBusy = ref(false)
const archiveError = ref('')
const dictionaryBusy = ref(false)
const dictionaryNotice = ref('')
const restoreNotice = ref('')
const hasSavedDevicePosition = ref(false)
const selectedEntity = ref<ReaderEntity | null>(null)
const fullBodyOpen = ref(false)
const entityPopoverStyle = ref<Record<string, string>>({})
let saveTimer: ReturnType<typeof setTimeout> | undefined
let localSaveTimer: ReturnType<typeof setTimeout> | undefined
let archivePoller: ReturnType<typeof setInterval> | undefined
let chromeTimer: ReturnType<typeof setTimeout> | undefined
let dictionaryPoller: ReturnType<typeof setInterval> | undefined
let restoringScroll = false
let userScrolled = false
function markScrollIntent(event: Event) {
  if ((event.target as HTMLElement)?.closest?.('input, select, textarea, button')) return
  if (event instanceof KeyboardEvent && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return
  userScrolled = true
}
let pendingRestorePosition: number | null = null
onBeforeRouteLeave(() => { saveDevicePosition(); userScrolled = false; clearTimeout(localSaveTimer); clearTimeout(saveTimer) })

function scrollPosition() {
  const maximum = document.documentElement.scrollHeight - window.innerHeight
  return maximum > 0 ? Math.max(0, Math.min(1, window.scrollY / maximum)) : 0
}

function localPositionKey(chapter = data.value?.chapter.id) {
  return chapter && data.value ? `inkrail-reader-position:${data.value.chapter.novelId}:${chapter}` : ''
}

function saveDevicePosition() {
  const key = localPositionKey()
  if (!key || !userScrolled || restoringScroll) return
  try { localStorage.setItem(key, JSON.stringify({ position: scrollPosition(), updatedAt: new Date().toISOString() })) } catch { return }
  hasSavedDevicePosition.value = true
}

async function applyScrollPosition(position: number) {
  if (!data.value?.source.paragraphs.length) {
    pendingRestorePosition = position
    return
  }
  pendingRestorePosition = null
  restoringScroll = true
  await nextTick()
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const maximum = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.max(0, position * maximum), behavior: 'auto' })
    setTimeout(() => { restoringScroll = false; saveDevicePosition() }, 80)
  }))
}

async function restoreDevicePosition() {
  if (!data.value) return
  try {
    const saved = JSON.parse(localStorage.getItem(localPositionKey()) || 'null')
    if (typeof saved?.position !== 'number') {
      hasSavedDevicePosition.value = false
      restoreNotice.value = 'No saved position on this device yet.'
    } else {
      await applyScrollPosition(saved.position)
      restoreNotice.value = data.value.source.paragraphs.length ? 'Restored this device’s saved position.' : 'Position will restore after the chapter finishes downloading.'
    }
  } catch {
    localStorage.removeItem(localPositionKey())
    hasSavedDevicePosition.value = false
    restoreNotice.value = 'The saved position on this device was invalid.'
  }
  setTimeout(() => { restoreNotice.value = '' }, 2500)
}

function checkSavedDevicePosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(localPositionKey()) || 'null')
    hasSavedDevicePosition.value = typeof saved?.position === 'number'
  } catch {
    hasSavedDevicePosition.value = false
  }
}

function resetPositionState() {
  if (!import.meta.client) return
  userScrolled = false
  restoreNotice.value = ''
  pendingRestorePosition = null
  checkSavedDevicePosition()
}

function restorePendingPosition() {
  if (pendingRestorePosition !== null) void applyScrollPosition(pendingRestorePosition)
}

function mobileReader() {
  return import.meta.client && window.matchMedia('(max-width: 639px)').matches
}

function scheduleChromeHide() {
  if (!mobileReader()) return
  if (chromeTimer) clearTimeout(chromeTimer)
  chromeTimer = setTimeout(() => { if (!document.activeElement?.closest('header, .reader-settings')) readerChromeVisible.value = false }, 3000)
}

function handleReaderTap(event: MouseEvent) {
  if (!mobileReader()) return
  const target = event.target instanceof Element ? event.target : null
  const isInteractive = Boolean(target?.closest('a, button, input, select'))
  if (!readerChromeVisible.value) {
    readerChromeVisible.value = true
    scheduleChromeHide()
    if (!isInteractive) {
      event.preventDefault()
      event.stopPropagation()
    }
    return
  }
  if (!isInteractive) scheduleChromeHide()
}

function openEntity(entity: ReaderEntity, event: MouseEvent) {
  selectedEntity.value = entity
  fullBodyOpen.value = false
  if (mobileReader()) {
    entityPopoverStyle.value = {}
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 320
  const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + rect.width / 2 - width / 2))
  const top = rect.bottom + 12 + 240 < window.innerHeight ? rect.bottom + 12 : Math.max(16, rect.top - 252)
  entityPopoverStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` }
}

function closeEntity() {
  selectedEntity.value = null
  fullBodyOpen.value = false
}

async function inferChapterEntities() {
  if (!data.value || dictionaryBusy.value) return
  dictionaryBusy.value = true; dictionaryNotice.value = ''
  try {
    const result: any = await $fetch('/api/encyclopedia/infer', { method: 'POST', body: { novelId: data.value.chapter.novelId, chapterIds: [data.value.chapter.id] } })
    dictionaryNotice.value = result.queued ? 'Names and places queued for inference. This context becomes available from the next chapter.' : 'This chapter dictionary is already current.'
    if (result.queued) startDictionaryPolling()
  } catch (cause: any) {
    dictionaryNotice.value = cause?.data?.statusMessage || cause?.message || 'Could not queue dictionary inference.'
  } finally { dictionaryBusy.value = false }
}

function startDictionaryPolling() {
  if (dictionaryPoller) clearInterval(dictionaryPoller)
  dictionaryPoller = setInterval(async () => {
    if (document.hidden) return
    await refresh()
    const status = data.value?.dictionary?.status || 'NOT_STARTED'
    if (!['COMPLETED', 'FAILED'].includes(status)) return
    if (dictionaryPoller) clearInterval(dictionaryPoller)
    dictionaryPoller = undefined
    dictionaryNotice.value = status === 'COMPLETED'
      ? `${data.value?.entities?.length || 0} spoiler-safe name and place entries available through this chapter.`
      : data.value?.dictionary?.error || 'Dictionary inference failed.'
  }, 2000)
}

async function ensureArchived() {
  if (!data.value || data.value.source.paragraphs.length || archiveBusy.value) return
  archiveBusy.value = true; archiveError.value = ''
  try {
    await $fetch(`/api/downloads/${encodeURIComponent(data.value.chapter.novel.sourceSite)}`, { method: 'POST', body: { sourceNovelId: data.value.chapter.novel.sourceNovelId, sourceChapterIds: [data.value.chapter.sourceChapterId] } })
    if (archivePoller) clearInterval(archivePoller)
    archivePoller = setInterval(async () => {
      if (document.hidden) return
      await refresh()
      if (data.value?.source.paragraphs.length || data.value?.chapter.scrapeStatus === 'FAILED') {
        if (archivePoller) clearInterval(archivePoller)
        archivePoller = undefined
        archiveBusy.value = false
        if (data.value?.chapter.scrapeStatus === 'FAILED') archiveError.value = data.value.chapter.scrapeError || 'Chapter download failed.'
      }
    }, 2000)
  } catch (cause: any) {
    archiveBusy.value = false
    archiveError.value = cause?.data?.statusMessage || cause?.message || 'Chapter download could not be started.'
  }
}

onMounted(() => {
  let saved: any = {}
  try { saved = JSON.parse(localStorage.getItem('inkrail-reader') || '{}') } catch { /* Ignore invalid device preferences. */ }
  window.addEventListener('pagehide', saveDevicePosition)
  for (const event of ['wheel', 'touchmove', 'keydown']) window.addEventListener(event, markScrollIntent, { passive: true })
  mode.value = saved.mode || (data.value?.translation.paragraphs.length ? 'translation' : 'source')
  theme.value = saved.theme || 'dark'; fontSize.value = saved.fontSize || 20; contentWidth.value = saved.contentWidth || 760
  resetPositionState()
  const onScroll = () => {
    if (!data.value) return
    if (mobileReader() && window.scrollY > 24) {
      readerChromeVisible.value = false
      if (chromeTimer) clearTimeout(chromeTimer)
    }
    if (restoringScroll || !userScrolled) return
    clearTimeout(localSaveTimer)
    localSaveTimer = setTimeout(saveDevicePosition, 150)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      $fetch('/api/progress', { method: 'POST', body: { novelId: data.value!.chapter.novelId, chapterId: data.value!.chapter.id, position: scrollPosition() } }).catch(() => undefined)
    }, 700)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  ensureArchived()
  if (['PENDING', 'RUNNING'].includes(data.value?.dictionary?.status || 'NOT_STARTED')) startDictionaryPolling()
  onBeforeUnmount(() => { saveDevicePosition(); window.removeEventListener('pagehide', saveDevicePosition); for (const event of ['wheel', 'touchmove', 'keydown']) window.removeEventListener(event, markScrollIntent); window.removeEventListener('scroll', onScroll); if (saveTimer) clearTimeout(saveTimer); if (localSaveTimer) clearTimeout(localSaveTimer); if (archivePoller) clearInterval(archivePoller); if (chromeTimer) clearTimeout(chromeTimer); if (dictionaryPoller) clearInterval(dictionaryPoller) })
})

watch(() => data.value?.chapter.id, () => { ensureArchived(); resetPositionState() })
watch(() => data.value?.source.paragraphs.length, restorePendingPosition)

watch([mode, theme, fontSize, contentWidth], () => {
  if (import.meta.client) localStorage.setItem('inkrail-reader', JSON.stringify({ mode: mode.value, theme: theme.value, fontSize: fontSize.value, contentWidth: contentWidth.value }))
})

const palette = computed(() => theme.value === 'sepia' ? 'bg-[#f0e7d2] text-[#302a20]' : theme.value === 'light' ? 'bg-[#f8f8f5] text-[#20221f]' : 'bg-[#111310] text-[#e9e5dc]')
const pairs = computed(() => {
  const source = data.value?.source.paragraphs || []; const translation = data.value?.translation.paragraphs || []
  return Array.from({ length: Math.max(source.length, translation.length) }, (_, index) => ({ source: source[index] || '', translation: translation[index] || '' }))
})

async function approve() {
  const translation = data.value?.chapter.translations.find((item: any) => item.outputPath)
  if (!translation) return
  await $fetch(`/api/translations/${translation.id}/approve`, { method: 'POST' }); await refresh()
}

async function translateChapter() {
  if (!data.value) return
  translationBusy.value = true; translationNotice.value = ''
  try {
    const result: any = await $fetch('/api/translations/queue', { method: 'POST', body: { novelId: data.value.chapter.novelId, chapterIds: [data.value.chapter.id] } })
    translationNotice.value = result.queued ? 'Queued. Codex translation will start shortly.' : 'This chapter is already queued or translated.'
    await refresh()
  } catch (cause: any) { translationNotice.value = cause?.data?.statusMessage || 'Translation operation failed. Please retry.' } finally { translationBusy.value = false }
}

async function regenerateTranslation() {
  if (!data.value) return
  translationBusy.value = true; translationNotice.value = ''
  try {
    const result: any = await $fetch('/api/translations/queue', {
      method: 'POST',
      body: { novelId: data.value.chapter.novelId, chapterIds: [data.value.chapter.id], regenerate: true }
    })
    translationNotice.value = result.queued ? 'Replacement translation queued.' : 'This chapter is already queued for regeneration.'
    await refresh()
  } catch (cause: any) {
    translationNotice.value = cause?.data?.statusMessage || cause?.message || 'Could not regenerate this translation.'
  } finally { translationBusy.value = false }
}

async function cancelTranslation() {
  if (!data.value) return
  translationBusy.value = true; translationNotice.value = ''
  try {
    const result: any = await $fetch('/api/translations/cancel', { method: 'POST', body: { chapterIds: [data.value.chapter.id] } })
    translationNotice.value = result.cancellationRequested ? 'Stopping the active Codex translation…' : 'Translation removed from the queue.'
    await refresh()
  } catch (cause: any) { translationNotice.value = cause?.data?.statusMessage || 'Translation operation failed. Please retry.' } finally { translationBusy.value = false }
}

async function prioritizeTranslation() {
  if (!data.value) return
  translationBusy.value = true; translationNotice.value = ''
  try {
    const result: any = await $fetch('/api/translations/prioritize', { method: 'POST', body: { chapterId: data.value.chapter.id } })
    translationNotice.value = result.ahead ? `Prioritized. ${result.ahead} promoted chapter${result.ahead === 1 ? '' : 's'} remain ahead.` : 'Prioritized. This chapter will be taken by the next available translation worker.'
    await refresh()
  } catch (cause: any) {
    translationNotice.value = cause?.data?.statusMessage || cause?.message || 'Could not prioritize this translation.'
    await refresh()
  } finally { translationBusy.value = false }
}

const canTranslate = computed(() => features.value?.translation && ['NOT_STARTED', 'FAILED', 'SOURCE_CHANGED'].includes(data.value?.translationStatus || ''))
const canCancel = computed(() => ['QUEUED', 'TRANSLATING'].includes(data.value?.translationStatus || ''))
const translationWarning = computed(() => data.value?.chapter.translations
  .find((item: any) => item.targetLanguage === data.value?.chapter.novel.targetLanguage)?.reviewNotes || '')
</script>

<template>
  <div v-if="data" class="reader-surface min-h-screen transition-colors" :class="palette" @click.capture="handleReaderTap">
    <header @focusin="readerChromeVisible = true" class="sticky top-0 z-40 border-b border-current/10 bg-inherit backdrop-blur-xl transition duration-200 sm:translate-y-0 sm:opacity-100" :class="readerChromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0'">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <NuxtLink :to="`/novels/${data.chapter.novel.slug}`" class="btn border-current/10 bg-transparent px-3">← <span class="mobile-hide">Directory</span></NuxtLink>
        <div class="min-w-0 text-center"><div class="truncate text-sm font-semibold">{{ data.translation.title || data.source.title }}</div><div class="text-[10px] opacity-75">Chapter {{ data.chapter.position }} · {{ data.translationStatus.replaceAll('_', ' ') }}</div></div>
        <div class="flex w-full justify-center gap-1 rounded-xl sm:w-auto border border-current/10 p-1 text-xs">
          <button v-for="option in ['translation','source','parallel']" :key="option" class="rounded-lg px-2.5 py-2 capitalize" :class="mode === option ? 'bg-current/10' : 'opacity-75'" :disabled="option !== 'source' && !data.translation.paragraphs.length" @click="mode = option as any">{{ option === 'translation' ? data.chapter.novel.targetLanguage : option === 'source' ? 'Original' : 'Side by side' }}</button>
        </div>
      </div>
    </header>

    <main class="mx-auto px-5 pb-28 pt-12" :style="{ maxWidth: `${mode === 'parallel' ? Math.min(contentWidth * 1.7, 1200) : contentWidth}px` }">
      <div class="mb-12 text-center">
        <p class="mb-3 text-xs uppercase tracking-[.2em] opacity-75">{{ data.chapter.novel.titleTranslated || data.chapter.novel.titleOriginal }}</p>
        <h1 class="font-serif text-3xl font-semibold leading-tight md:text-4xl">{{ mode === 'source' ? data.source.title : data.translation.title || data.source.title }}</h1>
        <p v-if="mode !== 'source' && data.translation.title" class="mt-3 font-serif text-sm opacity-75">{{ data.source.title }}</p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button v-if="canTranslate" class="btn border-current/10 bg-transparent" :disabled="translationBusy" @click="translateChapter">{{ translationBusy ? 'Queueing…' : 'Translate this chapter' }}</button>
          <template v-else-if="canCancel">
            <button v-if="data.translationStatus === 'QUEUED'" class="btn border-current/10 bg-transparent" :disabled="translationBusy || Boolean(data.translationJob?.priority)" @click="prioritizeTranslation">{{ data.translationJob?.priority ? 'Prioritized' : 'Prioritize translation' }}</button>
            <button class="btn border-current/10 bg-transparent" :disabled="translationBusy" @click="cancelTranslation">{{ data.translationStatus === 'TRANSLATING' ? 'Cancel active translation' : 'Remove from queue' }}</button>
          </template>
          <span v-if="data.translationStatus === 'TRANSLATING'" class="text-xs opacity-75">Codex CLI is working now.</span>
          <button v-if="features?.translation" class="btn border-current/10 bg-transparent" :disabled="dictionaryBusy" @click="inferChapterEntities">{{ dictionaryBusy ? 'Queueing…' : 'Scan names & places' }}</button>
        </div>
        <p v-if="!features?.translation" class="mt-3 text-sm">Translation and name scanning are disabled. To enable it, open tray Settings → Edit configuration, set INKRAIL_ENABLE_TRANSLATION=true, then apply configuration and restart.</p>
        <p v-if="translationNotice" class="mt-3 text-xs opacity-75">{{ translationNotice }}</p>
        <p v-if="dictionaryNotice" class="mt-3 text-xs opacity-75">{{ dictionaryNotice }}</p>
        <p v-if="translationWarning" class="mx-auto mt-3 max-w-2xl rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
          Translation kept with a review warning: {{ translationWarning }}
        </p>
      </div>

      <article class="font-serif" :style="{ fontSize: `${fontSize}px`, lineHeight: 1.9 }">
        <div v-if="!data.source.paragraphs.length" class="rounded-2xl border border-current/10 p-6 text-center text-sm opacity-75"><p>{{ archiveError || (archiveBusy ? 'Downloading this chapter automatically…' : 'Preparing chapter download…') }}</p><button v-if="archiveError" class="btn mt-4 border-current/10 bg-transparent" @click="ensureArchived">Retry</button></div>
        <template v-if="mode === 'parallel'">
          <div v-for="(pair, index) in pairs" :key="index" class="grid gap-4 border-b border-current/10 py-6 md:grid-cols-2 md:gap-10">
            <p class="m-0 opacity-60"><EntityText :text="pair.source" :entities="data.entities || []" @select="openEntity" /></p><p class="m-0"><EntityText :text="pair.translation || '—'" :entities="data.entities || []" @select="openEntity" /></p>
          </div>
        </template>
        <template v-else>
          <p v-for="(paragraph, index) in (mode === 'source' ? data.source.paragraphs : data.translation.paragraphs.length ? data.translation.paragraphs : data.source.paragraphs)" :key="index" class="mb-[1.2em]"><EntityText :text="paragraph" :entities="data.entities || []" @select="openEntity" /></p>
        </template>
      </article>

      <div v-if="data.translationStatus === 'NEEDS_REVIEW'" class="mt-12 grid gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 sm:grid-cols-2">
        <button class="btn w-full bg-amber-300 text-stone-950" :disabled="translationBusy" @click="regenerateTranslation">{{ translationBusy ? 'Queueing…' : 'Regenerate translation' }}</button>
        <button class="btn w-full border-current/15 bg-transparent" :disabled="translationBusy" @click="approve">Approve current translation</button>
      </div>

      <div class="mt-16 flex items-center justify-between border-t border-current/10 pt-8">
        <NuxtLink v-if="data.previous" :to="`/novels/${data.chapter.novel.slug}/chapters/${data.previous.id}`" class="btn border-current/10 bg-transparent">← Previous</NuxtLink><span v-else />
        <button v-if="data.translationStatus === 'TRANSLATED'" class="text-xs opacity-75 hover:opacity-100" @click="approve">Mark approved</button>
        <NuxtLink v-if="data.next" :to="`/novels/${data.chapter.novel.slug}/chapters/${data.next.id}`" class="btn border-current/10 bg-transparent">Next →</NuxtLink>
      </div>
    </main>

    <p v-if="restoreNotice" class="fixed bottom-20 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-current/10 bg-inherit px-4 py-2 text-center text-xs shadow-xl backdrop-blur-xl">{{ restoreNotice }}</p>

    <div class="reader-settings fixed bottom-4 left-4 z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-current/10 bg-inherit p-2 text-xs shadow-2xl backdrop-blur-xl sm:left-1/2 sm:-translate-x-1/2">
      <button class="flex h-8 items-center gap-1.5 rounded-lg border border-current/10 px-2.5" :class="hasSavedDevicePosition ? '' : 'opacity-75'" aria-label="Restore saved reading position" title="Restore saved reading position" @click="restoreDevicePosition"><span aria-hidden="true">↶</span><span class="hidden sm:inline">Restore</span></button>
      <select aria-label="Reading theme" v-model="theme" class="rounded-lg border border-current/10 bg-transparent px-2 py-2"><option value="dark">Dark</option><option value="sepia">Sepia</option><option value="light">Light</option></select>
      <button class="h-8 w-8 rounded-lg border border-current/10" @click="fontSize = Math.max(15, fontSize - 1)">A−</button>
      <span class="w-7 text-center opacity-75">{{ fontSize }}</span>
      <button class="h-8 w-8 rounded-lg border border-current/10" @click="fontSize = Math.min(30, fontSize + 1)">A+</button>
    </div>

    <template v-if="selectedEntity">
      <button type="button" class="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] sm:hidden" aria-label="Close reference" @click="closeEntity" />
      <aside class="fixed inset-x-3 bottom-3 z-[80] max-h-[78vh] overflow-y-auto rounded-3xl border border-current/15 bg-inherit shadow-2xl sm:inset-x-auto sm:bottom-auto sm:max-h-[min(680px,86vh)] sm:rounded-2xl" :style="entityPopoverStyle" role="dialog" aria-live="polite">
        <header class="relative isolate overflow-hidden p-5" :class="selectedEntity.avatarUrl ? 'text-white' : ''">
          <div v-if="selectedEntity.avatarUrl" class="absolute inset-0 -z-20 scale-110 bg-cover bg-center opacity-75 blur-xl" :style="{ backgroundImage: `url(${selectedEntity.avatarUrl})` }" />
          <div v-if="selectedEntity.avatarUrl" class="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/65 to-black/30" />
          <div class="flex items-start justify-between gap-4"><div class="flex min-w-0 items-center gap-3"><img v-if="selectedEntity.avatarUrl" :src="selectedEntity.avatarUrl" :alt="selectedEntity.translatedName || selectedEntity.originalName" class="h-16 w-16 shrink-0 rounded-2xl border border-white/15 object-cover shadow-xl" /><div class="min-w-0"><span class="text-[10px] font-semibold uppercase tracking-[.18em] opacity-75">{{ selectedEntity.type === 'CHARACTER' ? 'Character' : 'Place' }}</span><h2 class="mt-1 truncate font-serif text-2xl font-semibold">{{ selectedEntity.translatedName || selectedEntity.originalName }}</h2><p v-if="selectedEntity.translatedName" class="mt-1 text-sm opacity-75">{{ selectedEntity.originalName }}</p></div></div><button type="button" class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-current/15 bg-black/10 opacity-70 backdrop-blur hover:opacity-100" aria-label="Close reference" @click="closeEntity">✕</button></div>
          <button v-if="selectedEntity.fullBodyImageUrl" type="button" class="mt-4 rounded-full border border-current/15 bg-black/15 px-3 py-1.5 text-[11px] font-semibold backdrop-blur" :aria-expanded="fullBodyOpen" @click="fullBodyOpen = !fullBodyOpen">{{ fullBodyOpen ? 'Hide full body' : 'View full body' }}</button>
        </header>
        <div v-if="fullBodyOpen && selectedEntity.fullBodyImageUrl" class="border-y border-current/10 bg-black/15 p-3"><img :src="selectedEntity.fullBodyImageUrl" :alt="`Full-body view of ${selectedEntity.translatedName || selectedEntity.originalName}`" class="mx-auto max-h-[54vh] w-auto rounded-2xl object-contain shadow-2xl" /></div>
        <div class="p-5 pt-0">
        <div v-if="selectedEntity.firstIntroduction" class="mt-5 rounded-xl border border-current/10 p-3.5">
          <p class="text-[10px] font-semibold uppercase tracking-[.14em] opacity-75">{{ selectedEntity.firstIntroduction.chapter?.id === selectedEntity.lastAppearanceBeforeChapter?.chapter?.id ? 'First introduction · latest prior appearance' : 'First introduction' }}</p>
          <p class="mt-2 text-sm leading-6 opacity-70">{{ selectedEntity.firstIntroduction.description }}</p>
          <p v-if="selectedEntity.firstIntroduction.chapter" class="mt-2 text-[11px] opacity-75">Chapter {{ selectedEntity.firstIntroduction.chapter.position }} · {{ selectedEntity.firstIntroduction.chapter.titleTranslated || selectedEntity.firstIntroduction.chapter.titleOriginal }}</p>
        </div>
        <div v-if="selectedEntity.lastAppearanceBeforeChapter && selectedEntity.lastAppearanceBeforeChapter.chapter?.id !== selectedEntity.firstIntroduction?.chapter?.id" class="mt-3 rounded-xl border border-current/10 p-3.5">
          <p class="text-[10px] font-semibold uppercase tracking-[.14em] opacity-75">Latest appearance before this chapter</p>
          <p class="mt-2 text-sm leading-6 opacity-70">{{ selectedEntity.lastAppearanceBeforeChapter.description }}</p>
          <p v-if="selectedEntity.lastAppearanceBeforeChapter.chapter" class="mt-2 text-[11px] opacity-75">Chapter {{ selectedEntity.lastAppearanceBeforeChapter.chapter.position }} · {{ selectedEntity.lastAppearanceBeforeChapter.chapter.titleTranslated || selectedEntity.lastAppearanceBeforeChapter.chapter.titleOriginal }}</p>
        </div>
        <p v-if="selectedEntity.aliases?.length > 2" class="mt-4 text-xs leading-5 opacity-75">Also known as {{ selectedEntity.aliases.filter((alias: string) => ![selectedEntity.originalName, selectedEntity.translatedName].includes(alias)).join(', ') }}</p>
        <p class="mt-3 text-[10px] uppercase tracking-[.12em] opacity-75">Context ends before this chapter</p>
        </div>
      </aside>
    </template>
  </div>
  <p v-else-if="pending" role="status" class="p-8">Opening chapter…</p>
  <PageError v-else :error="error" :back-to="`/novels/${route.params.slug}`" @retry="refresh()" />
</template>
