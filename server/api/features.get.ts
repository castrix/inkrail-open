export default defineEventHandler(() => ({ translation: process.env.INKRAIL_ENABLE_TRANSLATION === 'true' }))
