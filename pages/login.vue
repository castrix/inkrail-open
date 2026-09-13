<script setup lang="ts">
definePageMeta({ layout: 'default' })
const route = useRoute()
const password = ref('')
const error = ref('')
const loading = ref(false)

async function unlock() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    const requested = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
    const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/library'
    await navigateTo(returnTo)
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'That password did not work.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative grid min-h-screen place-items-center overflow-hidden px-5">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(73,99,84,.35),transparent_38%),radial-gradient(circle_at_80%_80%,rgba(184,93,60,.15),transparent_35%)]" />
    <form class="surface relative w-full max-w-md rounded-3xl p-8" @submit.prevent="unlock">
      <div class="mb-9 flex items-center gap-4">
        <span class="grid h-12 w-12 place-items-center rounded-2xl bg-gold font-serif text-2xl font-semibold text-ink">I</span>
        <div>
          <h1 class="font-serif text-2xl font-semibold">Unlock Inkrail</h1>
          <p class="mt-1 text-sm text-white/45">Your personal novel and manga library.</p>
        </div>
      </div>
      <label class="mb-2 block text-xs font-semibold uppercase tracking-[.16em] text-white/45">Owner password</label>
      <input v-model="password" class="field" type="password" autocomplete="current-password" autofocus placeholder="Enter password" />
      <p v-if="error" class="mt-3 text-sm text-[#efa58b]">{{ error }}</p>
      <button class="btn btn-primary mt-6 w-full" :disabled="loading">{{ loading ? 'Unlocking…' : 'Enter library' }}</button>
      <p class="mt-6 text-center text-xs leading-5 text-white/35">Sign in with the owner password from your private configuration.</p>
    </form>
  </div>
</template>
