export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  try {
    await $fetch('/api/auth/me', { headers })
  } catch {
    return navigateTo({ path: '/login', query: { returnTo: to.fullPath } })
  }
})
