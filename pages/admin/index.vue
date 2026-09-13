<script setup lang="ts">
const url = ref('')
const importing = ref(false)
const openingBrowser = ref(false)
const message = ref('')
const error = ref('')
const { data: downloadSettings } = await useFetch<Array<{ source: string, rateLimit: boolean }>>('/api/downloads/settings')
const savingSource = ref('')
const settingsError = ref('')
const { data: installedSources } = await useFetch<any[]>('/api/sources')
const sourceNames = computed(() => Object.fromEntries((installedSources.value || []).map(s => [s.id, s.name])))
async function toggleDownloadLimit(source: string, enabled: boolean) {
  savingSource.value = source
  settingsError.value = ''
  try {
    await $fetch('/api/downloads/settings', { method: 'PATCH', body: { source, rateLimit: enabled } })
    const setting = downloadSettings.value?.find(item => item.source === source)
    if (setting) setting.rateLimit = enabled
  } catch { settingsError.value = 'Could not save download settings.' }
  finally { savingSource.value = '' }
}
const jobCategory = ref<'translation' | 'novel' | 'manga' | 'image'>('translation')
const jobLimit = ref(100)
const { data: jobData, refresh: refreshJobs } = await useFetch<any>(() => `/api/jobs?category=${jobCategory.value}&limit=${jobLimit.value}`)
const jobs = computed<any[]>(() => jobData.value?.items || [])
const { data: browserControl, refresh: refreshBrowser } = await useFetch<any>('/api/browser/twkan', { immediate: false })
const { data: activeJobData, refresh: refreshActiveJobs } = await useFetch<any>('/api/jobs/active')
const timer = ref<ReturnType<typeof setInterval>>()

onMounted(() => { timer.value = setInterval(() => { void refreshJobs(); if (installedSources.value?.some(s => s.id === 'twkan')) void refreshBrowser(); void refreshActiveJobs() }, 3000) })
onBeforeUnmount(() => { if (timer.value) clearInterval(timer.value) })

async function importNovel() {
  importing.value = true; message.value = ''; error.value = ''
  try {
    const result: any = await $fetch('/api/novels/import', { method: 'POST', body: { url: url.value } })
    message.value = `${result.novel.titleOriginal} added with ${result.chapterCount} chapter entries. Archiving has started.`
    await refreshJobs()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.data?.message || cause?.message || 'Import failed.'
  } finally { importing.value = false }
}

async function openBrowser() {
  message.value = ''; error.value = ''; openingBrowser.value = true
  try {
    const result: any = await $fetch('/api/browser/twkan', { method: 'POST' })
    browserControl.value = result
    if (result.browser.status === 'VERIFICATION_REQUIRED') error.value = result.browser.message
    else if (result.browser.status === 'ERROR') error.value = `The Windows browser could not open: ${result.browser.message}`
    else message.value = result.browser.message
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'The Windows host could not launch the persistent TWKAN browser.'
  } finally { openingBrowser.value = false }
}

const browserState = computed(() => browserControl.value?.browser?.status || 'CLOSED')
const blockedJobs = computed(() => (activeJobData.value?.items || []).filter((job: any) => job.status === 'WAITING_FOR_ACCESS'))
const jobTabs = [
  { id: 'translation', label: 'Translating' },
  { id: 'novel', label: 'Novel downloads' },
  { id: 'manga', label: 'Manga downloads' },
  { id: 'image', label: 'Character art' }
] as const
const jobSections = computed(() => [
  { id: 'working', label: 'Working now', jobs: jobs.value.filter((job: any) => job.isWorking) },
  { id: 'attention', label: 'Needs attention', jobs: jobs.value.filter((job: any) => !job.isWorking && ['RUNNING', 'CANCEL_REQUESTED', 'WAITING_FOR_ACCESS', 'FAILED', 'PARTIAL', 'RATE_LIMITED', 'PAUSED'].includes(job.status)) },
  { id: 'queued', label: 'Queued · oldest first', jobs: jobs.value.filter((job: any) => job.status === 'PENDING') },
  { id: 'history', label: 'History · oldest first', jobs: jobs.value.filter((job: any) => ['COMPLETED', 'CANCELED'].includes(job.status)) }
].filter(section => section.jobs.length))

async function selectJobCategory(category: 'translation' | 'novel' | 'manga' | 'image') {
  jobCategory.value = category
  jobLimit.value = 100
  await nextTick()
  await refreshJobs()
}

async function loadMoreJobs() {
  jobLimit.value += 100
  await nextTick()
  await refreshJobs()
}

async function loadAllJobs() {
  jobLimit.value = jobData.value?.total || jobLimit.value
  await nextTick()
  await refreshJobs()
}

function jobSubtitle(job: any) {
  if (job.chapter) return `${job.type === 'EXTRACT_ENTITIES' ? 'Dictionary · ' : job.type === 'REPAIR_TRANSLATION' ? 'Name repair · ' : ''}Chapter ${job.chapter.position} · ${job.chapter.titleTranslated || job.chapter.titleOriginal}`
  if (job.type === 'RECONCILE_DICTIONARY') return 'Canonicalizing names and translating dictionary descriptions'
  if (job.type === 'DOWNLOAD_MANGA') return 'Manga page download'
  if (job.type === 'SCRAPE_CHAPTERS') return 'Novel chapter download'
  if (job.type === 'GENERATE_CHARACTER_IMAGE') return 'Codex image generation'
  if (job.type === 'DETECT_CHARACTER_SKINS') return 'Codex skin detection'
  return 'Codex translation'
}

function jobDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))
}

function jobStatus(job: any) {
  return !job.isWorking && ['RUNNING', 'CANCEL_REQUESTED'].includes(job.status) ? 'INTERRUPTED' : job.status.replaceAll('_', ' ')
}

function browserBadge(status: string) {
  if (status === 'READY') return 'badge-good'
  if (status === 'VERIFICATION_REQUIRED') return 'badge-warn'
  if (status === 'ERROR') return 'badge-bad'
  return 'badge-muted'
}

async function resumeJob(id: string) {
  await $fetch(`/api/jobs/${id}/resume`, { method: 'POST' })
  await refreshJobs()
}

async function cancelJob(id: string) {
  await $fetch('/api/translations/cancel', { method: 'POST', body: { jobIds: [id] } })
  await refreshJobs()
}

function badge(status: string) {
  if (status === 'COMPLETED') return 'badge-good'
  if (['FAILED', 'PARTIAL', 'INTERRUPTED'].includes(status)) return 'badge-bad'
  if (['WAITING_FOR_ACCESS', 'RATE_LIMITED'].includes(status)) return 'badge-warn'
  if (['RUNNING', 'CANCEL_REQUESTED'].includes(status)) return 'badge-good'
  return 'badge-muted'
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-10 md:py-14">
    <div class="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p class="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-gold/80">Workspace</p>
        <h1 class="font-serif text-4xl font-semibold md:text-5xl">Collect and translate</h1>
        <p class="mt-3 text-sm text-white/45">One quiet pipeline from TWKAN to your reading shelf.</p>
      </div>
      <NuxtLink to="/admin/glossary" class="btn btn-quiet">Manage glossary</NuxtLink>
    </div>

    <section class="surface mb-6 rounded-2xl p-6">
      <h2 class="font-serif text-2xl font-semibold">Download workers</h2>
      <p class="mt-2 text-sm text-white/45">Each source downloads independently. Turn rate limiting off to skip pacing and automatic cooldown waits. Sources can still reject requests; immediate retries are limited to three. Changes apply during active downloads.</p>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label v-for="setting in downloadSettings" :key="setting.source" class="rounded-xl border border-white/10 p-4">
          <span class="block font-semibold">{{ sourceNames[setting.source] }}</span>
          <span class="mt-3 flex items-center gap-2 text-sm text-white/65"><input type="checkbox" :checked="setting.rateLimit" :disabled="Boolean(savingSource)" @change="toggleDownloadLimit(setting.source, ($event.target as HTMLInputElement).checked)" />Use rate limit</span>
        </label>
      </div>
      <p v-if="settingsError" class="mt-3 text-sm text-[#efad95]">{{ settingsError }}</p>
    </section>
    <div class="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <section class="surface rounded-2xl p-6 md:p-8">
        <span class="badge badge-good">TWKAN adapter</span>
        <h2 class="mt-5 font-serif text-2xl font-semibold">Import a novel</h2>
        <p class="mt-2 text-sm leading-6 text-white/45">Paste either the landing page or full-directory URL. Impit is attempted first; the persistent browser is used when rendering or manual verification is needed.</p>
        <form class="mt-6" @submit.prevent="importNovel">
          <label class="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-white/40">TWKAN URL</label>
          <input v-model="url" class="field" type="url" required />
          <button class="btn btn-primary mt-4" :disabled="importing">{{ importing ? 'Reading directory…' : 'Import and archive' }}</button>
        </form>
        <p v-if="message" class="mt-5 rounded-xl bg-moss/20 p-4 text-sm text-[#b8d8c3]">{{ message }}</p>
        <p v-if="error" class="mt-5 rounded-xl bg-rust/15 p-4 text-sm text-[#efad95]">{{ error }}</p>
      </section>

      <section class="surface rounded-2xl p-6 md:p-8">
        <div class="flex items-center justify-between gap-3"><span class="badge" :class="browserBadge(browserState)">{{ browserState.replaceAll('_', ' ') }}</span><span class="text-[10px] uppercase tracking-[.14em] text-white/30">{{ browserControl?.remoteControlEnabled ? 'Tailnet control enabled' : 'Local control only' }}</span></div>
        <h2 class="mt-5 font-serif text-2xl font-semibold">Windows browser session</h2>
        <p class="mt-2 text-sm leading-6 text-white/45">Open the persistent TWKAN profile on this Windows host from localhost or your private Tailscale reader. If verification appears, this panel will warn you while the host browser waits for manual completion.</p>
        <button class="btn btn-quiet mt-6" :disabled="openingBrowser" @click="openBrowser">{{ openingBrowser ? 'Opening on Windows…' : 'Open TWKAN browser' }}</button>
        <div v-if="browserState === 'VERIFICATION_REQUIRED'" class="mt-5 rounded-xl border border-[#d4a85f]/30 bg-[#d4a85f]/10 p-4 text-sm text-[#f0cb88]">
          <div class="font-semibold">Verification required on the Windows host</div>
          <div class="mt-1 text-xs leading-5 opacity-80">{{ browserControl?.browser?.message }} Complete it in the opened browser, then this status will update automatically.</div>
        </div>
        <div v-else-if="browserState === 'ERROR'" class="mt-5 rounded-xl bg-rust/15 p-4 text-sm text-[#efad95]">{{ browserControl?.browser?.message }}</div>
        <div v-else-if="browserState === 'READY'" class="mt-5 rounded-xl bg-moss/20 p-4 text-xs leading-5 text-[#b8d8c3]">Ready on Windows · {{ browserControl?.browser?.title || browserControl?.browser?.url }}</div>
      </section>
    </div>

    <div v-if="blockedJobs.length" class="mb-8 rounded-2xl border border-[#d4a85f]/30 bg-[#d4a85f]/10 p-5 text-[#f0cb88]">
      <div class="font-semibold">TWKAN access needs attention</div>
      <p class="mt-1 text-sm opacity-80">{{ blockedJobs.length }} archive job{{ blockedJobs.length === 1 ? '' : 's' }} paused after detecting a challenge or access block. Open the Windows browser, complete verification, then resume the job below.</p>
      <button class="btn btn-quiet mt-4" :disabled="openingBrowser" @click="openBrowser">Open browser on Windows</button>
    </div>

    <section class="mt-8">
      <div class="mb-4 flex items-end justify-between gap-4"><div><p class="text-xs uppercase tracking-[.18em] text-white/30">Job history</p><h2 class="mt-1 font-serif text-3xl font-semibold">Workspace queue</h2></div><button class="text-sm text-gold" @click="() => refreshJobs()">Refresh</button></div>
      <div class="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[.025] p-1">
        <button v-for="tab in jobTabs" :key="tab.id" class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition" :class="jobCategory === tab.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'" @click="selectJobCategory(tab.id)">
          {{ tab.label }} <span class="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px]">{{ jobData?.counts?.[tab.id] || 0 }}</span>
        </button>
      </div>
      <div class="space-y-5">
        <div v-if="!jobs.length" class="surface rounded-2xl px-6 py-12 text-center text-sm text-white/35">No jobs in this category yet.</div>
        <section v-for="section in jobSections" :key="section.id">
          <div class="mb-2 flex items-center gap-2 px-1"><span v-if="section.id === 'working'" class="h-2 w-2 animate-pulse rounded-full bg-gold" /><h3 class="text-xs font-semibold uppercase tracking-[.16em]" :class="section.id === 'working' ? 'text-gold' : 'text-white/35'">{{ section.label }}</h3><span class="text-[10px] text-white/25">{{ section.jobs.length }}</span></div>
          <div class="surface overflow-hidden rounded-2xl">
            <div v-for="job in section.jobs" :key="job.id" class="grid gap-3 border-b px-4 py-4 last:border-0 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto_190px] md:items-center" :class="section.id === 'working' ? 'border-gold/15 bg-gold/[.055] ring-1 ring-inset ring-gold/20' : 'border-white/8'">
              <div class="min-w-0">
                <div class="flex items-center gap-2"><span v-if="section.id === 'working'" class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold" /><NuxtLink v-if="job.novel?.slug" :to="job.novel.mediaType === 'MANGA' ? `/manga/${job.novel.slug}` : `/novels/${job.novel.slug}`" class="truncate font-medium hover:text-gold">{{ job.novel.titleOriginal }}</NuxtLink><span v-else class="truncate font-medium">Pending title</span></div>
                <div class="mt-1 truncate text-xs text-white/35">{{ jobSubtitle(job) }}</div>
                <div class="mt-1 flex items-center gap-2 text-[10px] text-white/20"><span>Queued {{ jobDate(job.createdAt) }}</span><span v-if="job.status === 'PENDING' && job.priority" class="rounded-full bg-gold/10 px-1.5 py-0.5 font-semibold text-gold">Priority</span></div>
              </div>
              <div class="flex items-center gap-2"><span class="badge" :class="badge(job.isWorking ? job.status : jobStatus(job))">{{ jobStatus(job) }}</span><button v-if="['WAITING_FOR_ACCESS','FAILED','PARTIAL'].includes(job.status)" class="text-xs text-gold" @click="resumeJob(job.id)">Resume</button><button v-if="job.type === 'TRANSLATE_CHAPTER' && ['PENDING','RUNNING','CANCEL_REQUESTED'].includes(job.status)" class="text-xs text-[#efa58b]" @click="cancelJob(job.id)">Cancel</button></div>
              <div>
                <div class="mb-1 flex justify-between text-[11px] text-white/35"><span>{{ job.progress }}/{{ job.total }}</span><span>{{ job.total ? Math.round(job.progress / job.total * 100) : 0 }}%</span></div>
                <div class="h-1.5 overflow-hidden rounded-full bg-white/8"><div class="h-full bg-gold transition-all" :class="section.id === 'working' && !job.progress ? 'w-1/3 animate-pulse' : ''" :style="job.progress ? { width: `${job.total ? job.progress / job.total * 100 : 0}%` } : undefined" /></div>
                <div v-if="job.error" class="mt-2 line-clamp-2 text-xs text-[#efa58b]">{{ job.error }}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-if="jobData?.hasMore" class="mt-5 flex flex-wrap justify-center gap-3"><button class="btn btn-quiet" @click="loadMoreJobs">Load 100 more · {{ jobs.length }} of {{ jobData.total }}</button><button class="btn btn-quiet" @click="loadAllJobs">Show all {{ jobData.total }}</button></div>
      <p v-else-if="jobs.length" class="mt-4 text-center text-[10px] text-white/25">Showing all {{ jobData?.total }} jobs in this category.</p>
    </section>
  </div>
</template>
