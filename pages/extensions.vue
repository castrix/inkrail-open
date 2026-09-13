<script setup lang="ts">
const { data, refresh } = await useFetch<any>('/api/extensions')
const url = ref(''), fingerprint = ref(''), trusted = ref(false), busy = ref(false), message = ref('')
const settings = reactive<Record<string, Record<string, string>>>({})
async function act(action: string, extra: Record<string, any> = {}) {
  busy.value = true; message.value = ''
  try { await $fetch('/api/extensions', { method: 'POST', body: { action, ...extra } }); await refresh(); message.value = 'Saved.' }
  catch (error: any) { message.value = error.data?.data?.message || error.data?.statusMessage || error.message }
  finally { busy.value = false }
}
function config(id: string) { return settings[id] ||= {} }
function installed(id: string) { return data.value?.installed.find((item: any) => item.manifest.id === id) }
async function openBrowser(id: string) {
  busy.value = true
  try { const result: any = await $fetch(`/api/sources/${id}/browser`, { method: 'POST' }); message.value = result.message || 'Browser opened on the server.' }
  catch (error: any) { message.value = error.data?.message || error.message }
  finally { busy.value = false }
}
function updateAvailable(id: string, version: string) {
  const item = installed(id); if (!item) return true
  const current = item.manifest.version.split('.').map(Number), next = version.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (next[i] !== current[i]) return next[i] > current[i]
  return false
}
</script>
<template>
  <div class="mx-auto max-w-5xl px-5 py-10">
    <h1 class="font-serif text-4xl">Extensions</h1>
    <p class="mt-3 text-white/55">Install sources from repositories you trust. Changes take effect while Inkrail is running.</p>
    <p v-if="message" role="status" class="my-5 rounded-xl border border-gold/30 p-4">{{ message }}</p>
    <section class="surface mt-8 rounded-2xl p-6">
      <h2 class="text-xl">Add repository</h2>
      <form class="mt-4 grid gap-4" @submit.prevent="act('addRepository', { url, fingerprint })">
        <label class="grid gap-2 text-sm">Repository index URL<input v-model="url" class="field" type="url" placeholder="https://publisher.example/index.json" required /></label>
        <label class="grid gap-2 text-sm">Publisher SHA-256 fingerprint<input v-model="fingerprint" class="field font-mono" placeholder="Fingerprint published by the repository author" required /></label>
        <label class="flex items-start gap-3 text-sm text-white/65"><input v-model="trusted" type="checkbox" required class="mt-1" />I trust this publisher. Installed extensions execute code on this computer; signatures identify the publisher, not whether their code is safe.</label>
        <button class="btn btn-primary justify-self-start" :disabled="busy || !trusted">Add repository</button>
      </form>
    </section>
    <section class="mt-10">
      <h2 class="font-serif text-2xl">Installed</h2>
      <p v-if="!data?.installed.length" class="mt-4 text-white/45">No sources installed. Add a repository below to get started.</p>
      <article v-for="item in data?.installed" :key="item.manifest.id" class="surface mt-4 rounded-2xl p-6">
        <div class="flex flex-wrap items-center gap-3"><h3 class="text-lg">{{ item.manifest.name }}</h3><span class="badge badge-muted">{{ item.manifest.version }}</span><span class="badge" :class="item.enabled ? 'badge-good' : 'badge-muted'">{{ item.enabled ? (item.running ? 'Running' : 'Ready') : 'Disabled' }}</span></div>
        <p class="mt-2 break-all text-xs text-white/40">{{ item.manifest.id }} · Publisher {{ item.publisher.slice(0, 16) }}…</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <NuxtLink v-if="item.enabled" class="btn btn-primary" :to="`/sources/${item.manifest.id}`">Browse</NuxtLink>
          <button class="btn btn-quiet" :disabled="busy" @click="act(item.enabled ? 'disable' : 'enable', { source: item.manifest.id })">{{ item.enabled ? 'Disable' : 'Enable' }}</button>
          <button v-if="item.enabled" class="btn btn-quiet" :disabled="busy" @click="act('restart', { source: item.manifest.id })">Restart</button>
          <button v-if="item.enabled && item.manifest.capabilities.includes('browser')" class="btn btn-quiet" :disabled="busy" @click="openBrowser(item.manifest.id)">Open source browser</button>
          <button v-if="item.previous" class="btn btn-quiet" :disabled="busy" @click="act('rollback', { source: item.manifest.id })">Rollback to {{ item.previous.manifest.version }}</button>
          <button class="btn btn-quiet" :disabled="busy" @click="act('uninstall', { source: item.manifest.id })">Uninstall</button>
        </div>
        <details v-if="item.manifest.settings.length" class="mt-5">
          <summary class="cursor-pointer text-sm text-gold">Source settings</summary>
          <form class="mt-4 grid gap-4" @submit.prevent="act('configure', { source: item.manifest.id, config: config(item.manifest.id) })">
            <label v-for="field in item.manifest.settings" :key="field.key" class="grid gap-2 text-sm">{{ field.label }}
              <select v-if="field.type === 'select'" v-model="config(item.manifest.id)[field.key]" class="field"><option v-for="option in field.options" :key="option">{{ option }}</option></select>
              <input v-else v-model="config(item.manifest.id)[field.key]" :type="field.type === 'secret' ? 'password' : 'text'" class="field" :placeholder="item.configuredKeys.includes(field.key) ? 'Configured — enter to replace, clear to remove' : 'Not configured'" autocomplete="off" />
            </label>
            <button class="btn btn-primary justify-self-start" :disabled="busy">Save settings</button>
          </form>
        </details>
      </article>
      <p class="mt-4 text-sm text-white/40">Uninstalling keeps downloaded books and reading progress. Jobs resume when the same source is installed again.</p>
    </section>
    <section v-for="repo in data?.repositories" :key="repo.fingerprint" class="mt-10">
      <div class="flex flex-wrap items-center gap-3"><h2 class="font-serif text-2xl">{{ repo.name }}</h2><button class="btn btn-quiet" :disabled="busy" @click="act('refreshRepository', { fingerprint: repo.fingerprint })">Check for updates</button><button class="btn btn-quiet" :disabled="busy" @click="act('removeRepository', { fingerprint: repo.fingerprint })">Remove repository</button></div>
      <p class="mt-2 break-all text-xs text-white/40">{{ repo.url }}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <article v-for="release in repo.packages" :key="release.manifest.id" class="surface rounded-2xl p-5">
          <h3>{{ release.manifest.name }} <span class="text-white/40">{{ release.manifest.version }}</span></h3>
          <p class="mt-2 text-sm text-white/50">{{ release.manifest.mediaType }} · {{ release.manifest.language }} · {{ release.manifest.contentRating }}</p>
          <button class="btn btn-primary mt-4" :disabled="busy || !updateAvailable(release.manifest.id, release.manifest.version)" @click="act('install', { source: release.manifest.id, fingerprint: repo.fingerprint })">{{ installed(release.manifest.id) ? (updateAvailable(release.manifest.id, release.manifest.version) ? 'Update' : 'Installed') : 'Install' }}</button>
        </article>
      </div>
    </section>
  </div>
</template>
