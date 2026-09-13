import { z } from 'zod'
import { createOwnerSession, passwordMatches } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = z.object({ password: z.string().min(1).max(256) }).parse(await readBody(event))
  if (!passwordMatches(body.password)) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }
  createOwnerSession(event)
  return { ok: true }
})
