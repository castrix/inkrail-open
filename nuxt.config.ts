export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    ownerPassword: '',
    ownerSessionSecret: '',
    authBypass: process.env.AUTH_BYPASS === 'true',
    remoteBrowserControl: process.env.REMOTE_BROWSER_CONTROL === 'true',
    codexTranslationModel: process.env.CODEX_TRANSLATION_MODEL || '',
    codexTranslationReasoningEffort: process.env.CODEX_TRANSLATION_REASONING_EFFORT || 'low',
    translationTargetLanguage: process.env.TRANSLATION_TARGET_LANGUAGE || 'English',
    dataDir: process.env.DATA_DIR || './data',
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'Inkrail'
    }
  },
  nitro: {
    ...(process.env.INKRAIL_BUILD_OUTPUT ? { output: { dir: process.env.INKRAIL_BUILD_OUTPUT } } : {}),
    experimental: { websocket: true }
  },
  vite: {
    server: { allowedHosts: true }
  },
  app: {
    head: {
      title: 'Inkrail — Personal novel reader',
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'description', content: 'A self-hosted novel and manga library with installable sources.' },
        { name: 'color-scheme', content: 'dark light' }
      ]
    }
  },
  typescript: { strict: true, typeCheck: true }
})
