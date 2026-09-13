export default defineNuxtPlugin(() => {
  const route = useRoute()
  const names: Record<string, string> = { library: 'Library', search: 'Search', sources: 'Sources', extensions: 'Extensions', schedules: 'Schedules', apps: 'Apps', speedtest: 'Connection test', admin: 'Workspace', login: 'Unlock', glossary: 'Glossary' }
  useHead({ htmlAttrs: { lang: 'en' }, title: () => {
    const slug = route.params.slug ? String(route.params.slug).replaceAll('-', ' ') : ''
    return `${slug ? `${slug}${route.path.endsWith('/read') || route.params.chapter ? ' · Reader' : ''}` : names[route.path.split('/').at(-1) || ''] || names[route.path.split('/')[1] || ''] || 'Library'} — Inkrail`
  } })
})
