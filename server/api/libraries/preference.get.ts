import { z } from 'zod'
import { preferredLibraryForSource } from '~/server/services/libraries'

export default defineEventHandler(async (event) => {
  const { sourceSite } = z.object({
    sourceSite: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/)
  }).parse(getQuery(event))
  const library = await preferredLibraryForSource(sourceSite)
  return { libraryId: library.id }
})
