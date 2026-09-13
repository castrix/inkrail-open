<script setup lang="ts">
import { ImageQueue } from '~/shared/utils/image-queue'
type ReaderMode = 'manga' | 'webtoon'
type ReaderPage = { sourcePageId: string, position: number, imageUrl: string, archived?: boolean, proxied?: boolean }
const props = withDefaults(defineProps<{ title: string, pages: ReaderPage[], backTo: string, defaultMode?: ReaderMode, sourceSite?: string }>(), { defaultMode: 'manga', sourceSite: '' })
const route = useRoute()
const mode = ref<ReaderMode>(props.defaultMode), direction = ref<'rtl' | 'ltr'>('ltr'), fit = ref<'height' | 'width'>('height')
const currentIndex = ref(Math.max(0, props.pages.findIndex(page => page.position === Number(route.query.page || 1))))
const currentPage = computed(() => props.pages[currentIndex.value])
const displayedPage = shallowRef<ReaderPage | undefined>(currentPage.value)
const imageLoading = ref(false), imageError = ref(''), chromeVisible = ref(true)
const pageNumber = computed(() => currentIndex.value + 1)
const sliderPage = ref(pageNumber.value)
const nearby = ref(new Set<number>())
const webtoonErrors = reactive(new Set<string>())
const ratios = reactive<Record<string, number>>({})
const elements = new Map<number, HTMLElement>()
let observer: IntersectionObserver | undefined, positionObserver: IntersectionObserver | undefined
let chromeTimer: ReturnType<typeof setTimeout> | undefined, preloadTimer: ReturnType<typeof setTimeout> | undefined
let queue: ImageQueue<HTMLImageElement> | undefined, touchStartX = 0, touchStartY = 0, ignoreClickUntil = 0, mounted = false

function saveSettings() {
  try { localStorage.setItem('inkrail-manga-reader', JSON.stringify({ mode: mode.value, direction: direction.value, directionVersion: 2, fit: fit.value })) } catch { /* Storage may be disabled. */ }
}
function updateUrl() {
  if (!import.meta.client || !currentPage.value) return
  const url = new URL(window.location.href)
  url.searchParams.set('page', String(currentPage.value.position))
  window.history.replaceState(window.history.state, '', url)
}
function keepChromeOpen() { chromeVisible.value = true; if (chromeTimer) clearTimeout(chromeTimer) }
function scheduleChromeHide() {
  if (chromeTimer) clearTimeout(chromeTimer)
  if (mode.value === 'manga') chromeTimer = setTimeout(() => { chromeVisible.value = false }, 2600)
}
async function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  if (url !== currentPage.value?.imageUrl && !url.startsWith('/api/manga/pages/')) {
    await new Promise<void>((resolve, reject) => {
      const delay = props.sourceSite === 'hitomi' ? 900 : props.sourceSite === 'nhentai' ? 850 : 350
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Cancelled')) }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  return new Promise((resolve, reject) => {
    const image = new Image()
    let finished = false
    const timeout = setTimeout(() => finish(new Error('Image timed out')), 30_000)
    const abort = () => finish(new Error('Cancelled'))
    function finish(error?: Error) {
      if (finished) return
      finished = true; clearTimeout(timeout); signal.removeEventListener('abort', abort)
      image.onload = null; image.onerror = null
      if (error) { image.src = ''; reject(error) } else resolve(image)
    }
    image.referrerPolicy = 'no-referrer'; image.decoding = 'async'
    image.fetchPriority = url === currentPage.value?.imageUrl ? 'high' : 'low'
    image.onload = () => { void image.decode().then(() => finish(), () => finish()) }
    image.onerror = () => finish(new Error('Could not load this page'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort(); else image.src = url
  })
}
function schedulePreload() {
  if (!mounted || mode.value !== 'manga' || !currentPage.value) return
  if (preloadTimer) clearTimeout(preloadTimer)
  imageLoading.value = true
  imageError.value = ''
  const current = currentPage.value.imageUrl
  queue?.setWindow([current])
  const delay = currentPage.value.archived ? 0 : props.sourceSite === 'hitomi' ? 900 : props.sourceSite === 'nhentai' ? 850 : 350
  preloadTimer = setTimeout(() => {
    const indices = [currentIndex.value, currentIndex.value + 1, currentIndex.value - 1, currentIndex.value + 2]
    queue?.setWindow(indices.map(index => props.pages[index]?.imageUrl).filter((url): url is string => Boolean(url)))
  }, delay)
}
function retryImage() { imageError.value = ''; imageLoading.value = true; if (currentPage.value) queue?.retry(currentPage.value.imageUrl) }
function setPage(index: number) {
  if (!props.pages.length) return
  currentIndex.value = Math.max(0, Math.min(props.pages.length - 1, index)); sliderPage.value = pageNumber.value
  updateUrl(); scheduleChromeHide()
  if (mode.value === 'webtoon') elements.get(currentIndex.value)?.scrollIntoView({ block: 'start' })
  else schedulePreload()
}
function nextPage() { setPage(currentIndex.value + 1) }
function previousPage() { setPage(currentIndex.value - 1) }
function leftZone() { if (Date.now() < ignoreClickUntil) return; direction.value === 'rtl' ? nextPage() : previousPage() }
function rightZone() { if (Date.now() < ignoreClickUntil) return; direction.value === 'rtl' ? previousPage() : nextPage() }
function toggleChrome() { chromeVisible.value = !chromeVisible.value; if (chromeVisible.value) scheduleChromeHide() }
function toggleFullscreen() { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen() }
function registerPage(index: number, element: any) {
  const previous = elements.get(index)
  if (previous === element) return
  if (previous) { observer?.unobserve(previous); positionObserver?.unobserve(previous) }
  if (!element) { elements.delete(index); return }
  elements.set(index, element); observer?.observe(element); positionObserver?.observe(element)
}
function measured(page: ReaderPage, event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) ratios[page.sourcePageId] = image.naturalWidth / image.naturalHeight
}
function setupWebtoon() {
  observer?.disconnect(); positionObserver?.disconnect()
  if (!mounted || mode.value !== 'webtoon') return
  observer = new IntersectionObserver(entries => {
    const next = new Set(nearby.value)
    for (const entry of entries) {
      const index = Number((entry.target as HTMLElement).dataset.index)
      if (entry.isIntersecting) next.add(index); else next.delete(index)
    }
    nearby.value = next
  }, { rootMargin: '1600px 0px' })
  positionObserver = new IntersectionObserver(entries => {
    const entry = entries.find(x => x.isIntersecting)
    if (entry) { currentIndex.value = Number((entry.target as HTMLElement).dataset.index); sliderPage.value = pageNumber.value; updateUrl() }
  }, { rootMargin: '-35% 0px -55%' })
  for (const element of elements.values()) { observer.observe(element); positionObserver.observe(element) }
  elements.get(currentIndex.value)?.scrollIntoView({ block: 'start' })
}
function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.matches('input,select,textarea,button') || mode.value !== 'manga') return
  if (['ArrowLeft','ArrowRight',' ','Enter'].includes(event.key)) event.preventDefault()
  if (event.key === 'ArrowLeft') leftZone(); else if (event.key === 'ArrowRight') rightZone(); else if (event.key === ' ' || event.key === 'Enter') toggleChrome()
}
function finishSwipe(event: TouchEvent) {
  if (mode.value !== 'manga' || (event.target as HTMLElement)?.closest('header,footer')) return
  const delta = (event.changedTouches[0]?.clientX || 0) - touchStartX
  const vertical = (event.changedTouches[0]?.clientY || 0) - touchStartY
  if (Math.abs(delta) < 60 || Math.abs(delta) <= Math.abs(vertical)) return
  const advance = direction.value === 'ltr' ? delta < 0 : delta > 0
  advance ? nextPage() : previousPage()
  ignoreClickUntil = Date.now() + 400
}
onMounted(() => {
  mounted = true
  queue = new ImageQueue(loadImage, (url, image, error) => {
    if (url !== currentPage.value?.imageUrl) return
    imageLoading.value = false
    if (error) imageError.value = 'Could not load this page.'
    else if (image) { displayedPage.value = currentPage.value; imageError.value = '' }
  }, 1, 6)
  try {
    const saved = JSON.parse(localStorage.getItem('inkrail-manga-reader') || '{}')
    if (['manga','webtoon'].includes(saved.mode)) mode.value = saved.mode
    // Older settings saved the old RTL default even when it was never chosen.
    if (saved.directionVersion === 2 && ['rtl','ltr'].includes(saved.direction)) direction.value = saved.direction
    if (['height','width'].includes(saved.fit)) fit.value = saved.fit
  } catch { /* Use defaults. */ }
  saveSettings()
  window.addEventListener('keydown', onKey)
  void nextTick(setupWebtoon); schedulePreload(); scheduleChromeHide()
})
watch(mode, () => {
  if (!mounted) return
  saveSettings(); if (preloadTimer) clearTimeout(preloadTimer)
  if (mode.value === 'webtoon') queue?.setWindow([]); else schedulePreload()
  void nextTick(setupWebtoon); scheduleChromeHide()
})
watch([direction, fit], () => { if (mounted) saveSettings() })
watch(() => props.pages, () => { currentIndex.value = Math.min(currentIndex.value, Math.max(0, props.pages.length - 1)); schedulePreload(); void nextTick(setupWebtoon) })
onBeforeUnmount(() => { mounted = false; queue?.dispose(); observer?.disconnect(); positionObserver?.disconnect(); window.removeEventListener('keydown', onKey); if (chromeTimer) clearTimeout(chromeTimer); if (preloadTimer) clearTimeout(preloadTimer) })
</script>

<template>
  <div class="min-h-screen select-none bg-black text-white" @touchstart.passive="touchStartX = $event.touches[0]?.clientX || 0; touchStartY = $event.touches[0]?.clientY || 0" @touchend.passive="finishSwipe">
    <header class="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-3 py-2 backdrop-blur-xl transition duration-200" :class="chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0'">
      <NuxtLink :to="backTo" class="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold">← Back</NuxtLink>
      <div class="min-w-0 flex-1 text-center"><div class="truncate text-xs font-semibold sm:text-sm">{{ title }}</div><div class="mt-0.5 text-[10px] text-white/40">{{ pageNumber }} / {{ pages.length }} <span v-if="currentPage?.archived" class="text-[#9fd6b0]">· Local</span><span v-else-if="currentPage?.proxied">· Source stream</span><span v-else>· Direct stream</span></div></div>
      <button class="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-sm" aria-label="Toggle fullscreen" @click="toggleFullscreen">⛶</button>
    </header>

    <main v-if="pages.length && mode === 'webtoon'" class="mx-auto max-w-5xl" @click="toggleChrome">
      <div v-for="(page, index) in pages" :key="page.sourcePageId" :ref="element => registerPage(index, element)" :data-index="index" class="relative w-full bg-black" :style="{ aspectRatio: String(ratios[page.sourcePageId] || 2 / 3) }">
        <img v-if="nearby.has(index) && !webtoonErrors.has(page.sourcePageId)" :src="page.imageUrl" :alt="`Page ${page.position}`" decoding="async" referrerpolicy="no-referrer" class="block h-auto w-full" @load="measured(page, $event)" @error="webtoonErrors.add(page.sourcePageId)" />
        <button v-if="nearby.has(index) && webtoonErrors.has(page.sourcePageId)" class="absolute inset-0 grid place-content-center text-sm text-gold" @click.stop="webtoonErrors.delete(page.sourcePageId)">Could not load page {{ page.position }}. Tap to retry.</button>
      </div>
    </main>

    <main v-else-if="pages.length" class="relative grid min-h-screen place-items-center overflow-hidden px-1 py-14 sm:px-6">
      <img v-if="displayedPage" :key="displayedPage.sourcePageId" :src="displayedPage.imageUrl" :alt="`Page ${displayedPage.position}`" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" class="block object-contain" :class="fit === 'height' ? 'max-h-[calc(100vh-7rem)] max-w-full' : 'h-auto w-full max-w-5xl'" />
      <div v-if="imageLoading || imageError" role="status" class="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-3 text-sm">{{ imageError || `Loading page ${pageNumber}…` }} <button v-if="imageError" class="ml-2 text-gold underline" @click="retryImage">Retry</button></div>
      <button class="absolute inset-y-14 left-0 w-[34%] cursor-w-resize bg-transparent" :aria-label="direction === 'rtl' ? 'Next page' : 'Previous page'" @click="leftZone"><span class="sr-only">{{ direction === 'rtl' ? 'Next page' : 'Previous page' }}</span></button>
      <button class="absolute inset-y-14 left-[34%] w-[32%] bg-transparent" aria-label="Toggle reader controls" @click="toggleChrome"><span class="sr-only">Toggle controls</span></button>
      <button class="absolute inset-y-14 right-0 w-[34%] cursor-e-resize bg-transparent" :aria-label="direction === 'rtl' ? 'Previous page' : 'Next page'" @click="rightZone"><span class="sr-only">{{ direction === 'rtl' ? 'Previous page' : 'Next page' }}</span></button>
    </main>

    <main v-else class="grid min-h-screen place-items-center px-5 text-center text-sm text-white/45">Opening manga…</main>

    <footer class="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/80 px-3 py-2 backdrop-blur-xl transition duration-200" :class="chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-white/10 p-0.5 text-[10px]"><button class="rounded-md px-2 py-1.5" :class="mode === 'manga' ? 'bg-white/15' : 'text-white/40'" @click="mode = 'manga'">Manga</button><button class="rounded-md px-2 py-1.5" :class="mode === 'webtoon' ? 'bg-white/15' : 'text-white/40'" @click="mode = 'webtoon'">Webtoon</button></div>
        <template v-if="mode === 'manga'">
          <label class="sr-only" for="manga-reading-direction">Reading direction</label>
          <select id="manga-reading-direction" v-model="direction" class="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs" @focus="keepChromeOpen" @blur="scheduleChromeHide">
            <option value="ltr">Left → right</option><option value="rtl">Right → left</option>
          </select>
          <button class="hidden rounded-lg border border-white/10 px-2 py-2 text-[10px] sm:block" @click="fit = fit === 'height' ? 'width' : 'height'">Fit {{ fit === 'height' ? 'height' : 'width' }}</button>
        </template>
        <div class="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
        <input v-model.number="sliderPage" type="range" @change="setPage(sliderPage - 1)" min="1" :max="Math.max(1, pages.length)" class="min-w-0 flex-1 accent-[#c9a96e]" aria-label="Current manga page" />
        <span class="w-14 text-right text-[10px] text-white/55">{{ pageNumber }}/{{ pages.length }}</span>
        </div>
      </div>
      <p v-if="mode === 'manga'" class="mx-auto mt-1 max-w-5xl text-[10px] text-white/40">{{ direction === 'ltr' ? 'Next page: tap right or swipe left' : 'Next page: tap left or swipe right' }}</p>
    </footer>
  </div>
</template>
