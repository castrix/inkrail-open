import { clearOwnerSession } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  clearOwnerSession(event)
  return { ok: true }
})
