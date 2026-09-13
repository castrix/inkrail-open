export function requireTranslationEnabled() {
  if (process.env.INKRAIL_ENABLE_TRANSLATION !== 'true') throw createError({ statusCode: 409, statusMessage: 'Translation is disabled. Set INKRAIL_ENABLE_TRANSLATION=true in the private configuration and restart Inkrail before queueing work.' })
}
