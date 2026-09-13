<script setup lang="ts">
type TestMode = 'quick' | 'standard' | 'large'
type TestResult = { latency: number, jitter: number, download: number, upload: number, testedAt: string, host: string }

const presets: Record<TestMode, { label: string, description: string, download: number, upload: number, streams: number }> = {
  quick: { label: 'Quick', description: '8 MB down · 4 MB up', download: 8 * 1024 * 1024, upload: 4 * 1024 * 1024, streams: 1 },
  standard: { label: 'Standard', description: '32 MB down · 16 MB up', download: 32 * 1024 * 1024, upload: 16 * 1024 * 1024, streams: 2 },
  large: { label: 'Large', description: '96 MB down · 48 MB up', download: 96 * 1024 * 1024, upload: 48 * 1024 * 1024, streams: 2 }
}

const mode = ref<TestMode>('quick')
const running = ref(false)
const phase = ref<'idle' | 'latency' | 'download' | 'upload' | 'complete' | 'cancelled' | 'error'>('idle')
const error = ref('')
const latency = ref<number | null>(null)
const jitter = ref<number | null>(null)
const download = ref<number | null>(null)
const upload = ref<number | null>(null)
const latencyDone = ref(0)
const downloadedBytes = ref(0)
const expectedDownloadBytes = ref(0)
const uploadedBytes = ref(0)
const expectedUploadBytes = ref(0)
const history = ref<TestResult[]>([])
const currentHost = ref('Inkrail server')
let controller: AbortController | null = null

const progress = computed(() => {
  if (phase.value === 'complete') return 100
  if (phase.value === 'latency') return Math.round((latencyDone.value / 8) * 25)
  if (phase.value === 'download') return Math.min(75, 25 + Math.round((downloadedBytes.value / Math.max(1, expectedDownloadBytes.value)) * 50))
  if (phase.value === 'upload') return Math.min(99, 75 + Math.round((uploadedBytes.value / Math.max(1, expectedUploadBytes.value)) * 25))
  return 0
})
const phaseLabels: Record<string, string> = { idle: 'Ready', latency: 'Testing latency', download: 'Testing download', upload: 'Testing upload', complete: 'Complete', cancelled: 'Cancelled', error: 'Test failed' }
const phaseLabel = computed(() => phaseLabels[String(phase.value)] || 'Ready')

function mbps(bytes: number, milliseconds: number) {
  return (bytes * 8) / (Math.max(1, milliseconds) / 1000) / 1_000_000
}
function shown(value: number | null, digits = 1) {
  return value === null ? '—' : value.toFixed(digits)
}
function saveResult(result: TestResult) {
  history.value = [result, ...history.value].slice(0, 5)
  localStorage.setItem('inkrail-speedtest-history', JSON.stringify(history.value))
}

async function ping(signal: AbortSignal) {
  const started = performance.now()
  const response = await fetch(`/api/speedtest/ping?t=${Date.now()}-${Math.random()}`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Latency probe returned HTTP ${response.status}`)
  return performance.now() - started
}

async function testDownload(bytes: number, streams: number, signal: AbortSignal) {
  const perStream = Math.ceil(bytes / streams)
  expectedDownloadBytes.value = perStream * streams
  downloadedBytes.value = 0
  const started = performance.now()
  download.value = 0
  const timer = window.setInterval(() => { download.value = mbps(downloadedBytes.value, performance.now() - started) }, 100)
  try {
    await Promise.all(Array.from({ length: streams }, async (_, index) => {
      const response = await fetch(`/api/speedtest/download?bytes=${perStream}&stream=${index}&t=${Date.now()}`, { cache: 'no-store', signal })
      if (!response.ok || !response.body) throw new Error(`Download probe returned HTTP ${response.status}`)
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        downloadedBytes.value += value.byteLength
      }
    }))
    return mbps(downloadedBytes.value, performance.now() - started)
  } finally { window.clearInterval(timer) }
}

async function testUpload(bytes: number, signal: AbortSignal) {
  const payload = new Uint8Array(bytes)
  expectedUploadBytes.value = bytes
  uploadedBytes.value = 0
  upload.value = 0
  const started = performance.now()
  const timer = window.setInterval(() => { upload.value = mbps(uploadedBytes.value, performance.now() - started) }, 100)
  try {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      const cleanup = () => signal.removeEventListener('abort', abort)
      const fail = (cause: Error) => { cleanup(); reject(cause) }
      const abort = () => { request.abort(); fail(new DOMException('Test cancelled', 'AbortError')) }
      request.open('POST', '/api/speedtest/upload')
      request.setRequestHeader('content-type', 'application/octet-stream')
      request.upload.onprogress = (event) => { uploadedBytes.value = Math.min(bytes, event.loaded) }
      request.onerror = () => fail(new Error('Upload connection failed'))
      request.onabort = () => fail(new DOMException('Test cancelled', 'AbortError'))
      request.onload = () => {
        if (request.status < 200 || request.status >= 300) {
          fail(new Error(`Upload probe returned HTTP ${request.status}`))
          return
        }
        try {
          const result = JSON.parse(request.responseText) as { received: number }
          if (result.received !== bytes) throw new Error(`Server received ${result.received} of ${bytes} bytes`)
          uploadedBytes.value = bytes
          cleanup()
          resolve()
        } catch (cause) { fail(cause instanceof Error ? cause : new Error('Invalid upload response')) }
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      request.send(payload)
    })
    return mbps(bytes, performance.now() - started)
  } finally { window.clearInterval(timer) }
}

async function start() {
  if (running.value) return
  running.value = true; error.value = ''; latency.value = null; jitter.value = null; download.value = null; upload.value = null
  latencyDone.value = 0; downloadedBytes.value = 0; expectedDownloadBytes.value = 0; uploadedBytes.value = 0; expectedUploadBytes.value = 0
  controller = new AbortController()
  const signal = controller.signal
  try {
    await ping(signal)
    phase.value = 'latency'
    const samples: number[] = []
    for (let index = 0; index < 8; index += 1) {
      samples.push(await ping(signal)); latencyDone.value = index + 1
    }
    const sorted = [...samples].sort((a, b) => a - b)
    latency.value = sorted[Math.floor(sorted.length / 2)]
    jitter.value = samples.slice(1).reduce((total, sample, index) => total + Math.abs(sample - samples[index]), 0) / Math.max(1, samples.length - 1)

    phase.value = 'download'
    const selected = presets[String(mode.value) as TestMode]
    download.value = await testDownload(selected.download, selected.streams, signal)
    phase.value = 'upload'
    upload.value = await testUpload(selected.upload, signal)
    phase.value = 'complete'
    saveResult({ latency: latency.value, jitter: jitter.value, download: download.value, upload: upload.value, testedAt: new Date().toISOString(), host: location.host })
  } catch (cause: any) {
    controller?.abort()
    if (cause?.name === 'AbortError') phase.value = 'cancelled'
    else { phase.value = 'error'; error.value = cause?.message || 'The connection test failed.' }
  } finally {
    running.value = false; controller = null
  }
}

function cancel() { controller?.abort() }
function selectMode(value: string | number) { mode.value = String(value) as TestMode }

onMounted(() => {
  currentHost.value = location.host
  try { history.value = JSON.parse(localStorage.getItem('inkrail-speedtest-history') || '[]').slice(0, 5) } catch { history.value = [] }
})
onBeforeUnmount(cancel)
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-10 md:py-16">
    <section class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
      <div><p class="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-gold">Network tools</p><h1 class="font-serif text-4xl font-semibold md:text-6xl">Connection speed test</h1><p class="mt-4 max-w-2xl text-sm leading-7 text-muted">This measures your browser’s connection to this Inkrail server, not general internet speed, including Tailscale, Wi-Fi or mobile data, encryption, and HTTP overhead.</p></div>
      <div class="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-muted"><span class="mr-2 inline-block h-2 w-2 rounded-full bg-[#8ecaa3]"></span>{{ currentHost }}</div>
    </section>

    <section class="surface mt-10 overflow-hidden rounded-3xl">
      <div class="grid gap-8 p-5 sm:p-8 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[.2em] text-muted">Test size</p>
          <div class="mt-4 grid grid-cols-3 gap-2">
            <button v-for="(preset, key) in presets" :key="key" class="rounded-xl border px-2 py-3 text-left transition sm:px-4" :class="mode === key ? 'border-gold/70 bg-gold/10 text-gold' : 'border-white/10 bg-white/[.025] text-muted'" :disabled="running" @click="selectMode(key)"><span class="block text-sm font-semibold">{{ preset.label }}</span><span class="mt-1 block text-xs opacity-80">{{ preset.description }}</span></button>
          </div>

          <div class="mt-8 rounded-2xl border border-white/10 bg-black/15 p-5">
            <div class="flex items-center justify-between text-sm"><span class="font-semibold">{{ phaseLabel }}</span><span class="font-mono text-muted">{{ progress }}%</span></div>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div class="h-full rounded-full bg-gold transition-[width] duration-300" :style="{ width: `${progress}%` }" /></div>
            <p v-if="phase === 'download'" class="mt-3 text-xs text-muted">{{ (downloadedBytes / 1024 / 1024).toFixed(1) }} of {{ (expectedDownloadBytes / 1024 / 1024).toFixed(0) }} MB received</p>
            <p v-else-if="phase === 'upload'" class="mt-3 text-xs text-muted">{{ (uploadedBytes / 1024 / 1024).toFixed(1) }} of {{ (expectedUploadBytes / 1024 / 1024).toFixed(0) }} MB sent<span v-if="uploadedBytes === expectedUploadBytes"> · Waiting for server confirmation</span></p>
            <p v-else class="mt-3 text-xs text-muted">Test data is generated in memory and is never saved.</p>
          </div>

          <button v-if="!running" class="btn btn-primary mt-5 w-full py-3.5" @click="start">Start speed test</button>
          <button v-else class="btn btn-danger mt-5 w-full py-3.5" @click="cancel">Cancel test</button>
          <p v-if="error" class="mt-4 rounded-xl border border-[#efa58b]/30 bg-[#efa58b]/10 px-4 py-3 text-sm text-[#efa58b]">{{ error }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:gap-4">
          <div class="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-7"><p class="text-xs uppercase tracking-[.18em] text-muted">Latency</p><p class="mt-4 font-serif text-4xl font-semibold sm:text-5xl">{{ shown(latency) }}</p><p class="mt-1 text-xs text-muted">milliseconds</p></div>
          <div class="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-7"><p class="text-xs uppercase tracking-[.18em] text-muted">Jitter</p><p class="mt-4 font-serif text-4xl font-semibold sm:text-5xl">{{ shown(jitter) }}</p><p class="mt-1 text-xs text-muted">milliseconds</p></div>
          <div class="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-7"><p class="text-xs uppercase tracking-[.18em] text-muted">Download</p><p class="mt-4 font-serif text-4xl font-semibold text-gold sm:text-5xl">{{ shown(download) }}</p><p class="mt-1 text-xs text-muted">Mbps<span v-if="phase === 'download'"> · Live average</span></p></div>
          <div class="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-7"><p class="text-xs uppercase tracking-[.18em] text-muted">Upload</p><p class="mt-4 font-serif text-4xl font-semibold text-gold sm:text-5xl">{{ shown(upload) }}</p><p class="mt-1 text-xs text-muted">Mbps<span v-if="phase === 'upload'"> · Live average</span></p></div>
        </div>
      </div>
    </section>

    <section v-if="history.length" class="mt-12"><div class="mb-4 flex items-center justify-between"><h2 class="font-serif text-2xl font-semibold">Recent results</h2><span class="text-xs text-muted">Stored on this device</span></div><div class="speed-history overflow-x-auto rounded-2xl border border-white/10"><table class="w-full min-w-[620px] text-left text-sm"><thead class="bg-white/[.035] text-xs uppercase tracking-wider text-muted"><tr><th class="px-5 py-3">When</th><th class="px-5 py-3">Latency</th><th class="px-5 py-3">Jitter</th><th class="px-5 py-3">Download</th><th class="px-5 py-3">Upload</th></tr></thead><tbody><tr v-for="item in history" :key="item.testedAt" class="border-t border-white/10"><td class="px-5 py-4 text-muted">{{ new Date(item.testedAt).toLocaleString() }}</td><td class="px-5 py-4">{{ item.latency.toFixed(1) }} ms</td><td class="px-5 py-4">{{ item.jitter.toFixed(1) }} ms</td><td class="px-5 py-4 text-gold">{{ item.download.toFixed(1) }} Mbps</td><td class="px-5 py-4 text-gold">{{ item.upload.toFixed(1) }} Mbps</td></tr></tbody></table></div></section>
  </div>
</template>
