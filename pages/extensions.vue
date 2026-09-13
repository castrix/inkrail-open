<script setup lang="ts">
const { data, refresh } = await useFetch<any>('/api/extensions')
const url = ref(''), fingerprint = ref(''), trusted = ref(false), busy = ref(''), message = ref('')
const repoOpen = ref(!data.value?.repositories?.length)
const search = ref('')
const notices = reactive<Record<string, string>>({})
const pendingActions = reactive<Record<string, boolean>>({})
const confirmation = ref<{ action: string, extra: Record<string, any> } | null>(null)
const installedItems = computed(() => (data.value?.installed || []).filter((item: any) => item.manifest.name.toLowerCase().includes(search.value.toLowerCase())))
function usePublicRepository() { url.value = 'https://raw.githubusercontent.com/castrix/inkrail-sources/main/repository/index.json'; fingerprint.value = 'cfc683ef1fc8e8504bbdb899ba839116eb6deb120b7aa07e18ca91bf1f624436'; trusted.value = false }
const settings = reactive<Record<string, Record<string, string>>>({})
watch(data, (value: any) => { for (const item of value?.installed || []) settings[item.manifest.id] ||= { ...item.settings } }, { immediate: true })
async function act(action: string, extra: Record<string, any> = {}, confirmed = false) {
  if (!confirmed && ['uninstall', 'removeRepository'].includes(action)) { confirmation.value = { action, extra }; return }
  confirmation.value = null
  const key = extra.source || extra.fingerprint || 'repository'
  if (pendingActions[key]) return
  pendingActions[key] = true
  busy.value = key; message.value = ''; notices[key] = `${action === 'install' ? 'Downloading and verifying package' : 'Applying change'}…`
  try { await $fetch('/api/extensions', { method: 'POST', body: { action, ...extra } }); await refresh(); if (action === 'configure') settings[key] = { ...installed(key)?.settings }; message.value = `${extra.source || 'Repository'}: ${({ configure: 'settings saved', enable: 'enabled', disable: 'disabled', install: 'installed', restart: 'restarted', rollback: 'rolled back', addRepository: 'added', removeRepository: 'removed', refreshRepository: 'update check completed', uninstall: 'uninstalled' } as Record<string, string>)[action] || 'updated'}.`; notices[key] = message.value; if (action === 'addRepository') repoOpen.value = false }
  catch (error: any) { message.value = error.data?.data?.message || error.data?.statusMessage || error.message; notices[key] = message.value }
  finally { busy.value = ''; pendingActions[key] = false }
}
function config(id: string) { return settings[id] ||= {} }
function installed(id: string) { return data.value?.installed.find((item: any) => item.manifest.id === id) }
async function openBrowser(id: string) {
  if (pendingActions[id]) return
  pendingActions[id] = true; busy.value = id
  try { const result: any = await $fetch(`/api/sources/${id}/browser`, { method: 'POST' }); message.value = result.message || 'Browser opened on the server.' }
  catch (error: any) { message.value = error.data?.message || error.message }
  finally { busy.value = ''; pendingActions[id] = false; notices[id] = message.value }
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
    <p class="mt-3 text-muted">Install sources from repositories you trust. Changes take effect while Inkrail is running.</p>
    <p v-if="message" role="status" class="my-5 rounded-xl border border-gold/30 p-4">{{ message }}</p>
    <details class="surface mt-6 rounded-2xl p-5" :open="repoOpen" @toggle="repoOpen = ($event.target as HTMLDetailsElement).open">
      <summary class="cursor-pointer text-xl">Add repository</summary><p class="my-4 text-sm text-muted">Use the public Inkrail sources repository or add another trusted publisher. <a class="text-gold underline" href="https://github.com/castrix/inkrail-sources#readme" target="_blank" rel="noopener noreferrer">Import guide and publisher details</a>.</p><button type="button" class="btn btn-quiet" @click="usePublicRepository">Use public repository</button>
      <form class="mt-4 grid gap-4" @submit.prevent="act('addRepository', { url, fingerprint })">
        <label class="grid gap-2 text-sm">Repository index URL<input v-model="url" class="field" type="url" placeholder="https://publisher.example/index.json" required /></label>
        <label class="grid gap-2 text-sm">Publisher SHA-256 fingerprint<input v-model="fingerprint" class="field font-mono" placeholder="Fingerprint published by the repository author" required /></label>
        <label class="flex items-start gap-3 text-sm text-white/65"><input v-model="trusted" type="checkbox" required class="mt-1" />I trust this publisher. Installed extensions execute code on this computer; signatures identify the publisher, not whether their code is safe.</label>
        <button class="btn btn-primary justify-self-start" :disabled="Boolean(busy) || !trusted">Add repository</button>
      </form>
    </details>
    <section class="mt-8">
      <h2 class="font-serif text-2xl">Installed sources</h2><label class="mt-4 block">Find a source<input v-model="search" class="field mt-2" type="search" placeholder="Source name" /></label>
      <p v-if="!data?.installed.length" class="mt-4 text-muted">No sources installed. Open Add repository above to get started.</p>
      <article v-for="item in installedItems" :key="item.manifest.id" class="surface mt-4 rounded-2xl p-6">
        <div class="flex flex-wrap items-center gap-3"><h3 class="text-lg">{{ item.manifest.name }}</h3><span class="badge badge-muted">{{ item.manifest.version }}</span><span class="badge" :class="item.enabled ? 'badge-good' : 'badge-muted'">{{ item.enabled ? (item.running ? 'Process running' : 'Ready') : 'Disabled' }}</span></div>
        <p class="mt-2 break-all text-xs text-muted">{{ item.manifest.id }} · Publisher {{ item.publisher.slice(0, 16) }}…</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <NuxtLink v-if="item.enabled" class="btn btn-primary" :to="`/sources/${item.manifest.id}`">Browse</NuxtLink>
          <button class="btn btn-quiet" :disabled="Boolean(pendingActions[item.manifest.id])" @click="act(item.enabled ? 'disable' : 'enable', { source: item.manifest.id })">{{ item.enabled ? 'Disable' : 'Enable' }}</button>
          <button v-if="item.enabled" class="btn btn-quiet" :disabled="Boolean(pendingActions[item.manifest.id])" @click="act('restart', { source: item.manifest.id })">Restart</button>
          <button v-if="item.enabled && item.manifest.capabilities.includes('browser')" class="btn btn-quiet" :disabled="Boolean(pendingActions[item.manifest.id])" @click="openBrowser(item.manifest.id)">Open source browser</button>
          <button v-if="item.previous" class="btn btn-quiet" :disabled="Boolean(pendingActions[item.manifest.id])" @click="act('rollback', { source: item.manifest.id })">Rollback to {{ item.previous.manifest.version }}</button>
          <button class="btn btn-quiet" :disabled="Boolean(pendingActions[item.manifest.id])" @click="act('uninstall', { source: item.manifest.id })">Uninstall</button>
        </div>
        <p v-if="notices[item.manifest.id]" role="status" class="mt-4 text-sm text-gold">{{ notices[item.manifest.id] }}</p>
        <details v-if="item.manifest.settings.length" class="mt-5">
          <summary class="cursor-pointer text-sm text-gold">Source settings</summary>
          <form class="mt-4 grid gap-4" @submit.prevent="act('configure', { source: item.manifest.id, config: config(item.manifest.id) })">
            <label v-for="field in item.manifest.settings" :key="field.key" class="grid gap-2 text-sm">{{ field.label }}
              <select v-if="field.type === 'select'" v-model="config(item.manifest.id)[field.key]" class="field"><option v-for="option in field.options" :key="option">{{ option }}</option></select>
              <input v-else v-model="config(item.manifest.id)[field.key]" :type="field.type === 'secret' ? 'password' : 'text'" class="field" :placeholder="item.configuredKeys.includes(field.key) ? 'Saved securely — leave untouched to keep' : 'Not configured'" autocomplete="off" />
            </label>
            <button class="btn btn-primary justify-self-start" :disabled="Boolean(pendingActions[item.manifest.id])">Save settings</button>
          </form>
        </details>
      </article>
      <p class="mt-4 text-sm text-muted">Uninstalling keeps downloaded books and reading progress. Jobs resume when the same source is installed again.</p>
    </section>
    <section v-for="repo in data?.repositories" :key="repo.fingerprint" class="mt-10">
      <div class="flex flex-wrap items-center gap-3"><h2 class="font-serif text-2xl">{{ repo.name }}</h2><button class="btn btn-quiet" :disabled="Boolean(busy)" @click="act('refreshRepository', { fingerprint: repo.fingerprint })">Check for updates</button><button class="btn btn-quiet" :disabled="Boolean(busy)" @click="act('removeRepository', { fingerprint: repo.fingerprint })">Remove repository</button></div>
      <p class="mt-2 break-all text-xs text-muted">{{ repo.url }}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <article v-for="release in repo.packages" :key="release.manifest.id" class="surface rounded-2xl p-5">
          <h3>{{ release.manifest.name }} <span class="text-muted">{{ release.manifest.version }}</span></h3>
          <p class="mt-2 text-sm text-muted">{{ release.manifest.mediaType }} · {{ release.manifest.language }} · {{ release.manifest.contentRating }}</p>
          <p v-if="notices[release.manifest.id]" role="status" class="mt-3 text-sm text-gold">{{ notices[release.manifest.id] }}</p>
          <button class="btn btn-primary mt-4" :disabled="Boolean(pendingActions[release.manifest.id]) || !updateAvailable(release.manifest.id, release.manifest.version)" @click="act('install', { source: release.manifest.id, fingerprint: repo.fingerprint })">{{ installed(release.manifest.id) ? (updateAvailable(release.manifest.id, release.manifest.version) ? 'Update' : 'Installed') : 'Install' }}</button>
        </article>
      </div>
    </section>
    <AppDialog v-if="confirmation" title="Confirm removal" @close="confirmation = null"><p class="mb-5">{{ confirmation.action === 'uninstall' ? 'Uninstall this source? Downloaded books and progress stay on this computer. New downloads need the source to be installed again.' : 'Remove this repository? Installed sources remain available, but updates from this repository stop until you add it again.' }}</p><button class="btn btn-danger" @click="act(confirmation.action, confirmation.extra, true)">Confirm removal</button></AppDialog>
  </div>
</template>
