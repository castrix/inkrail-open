import prisma from '~/server/lib/prisma'

export async function ensureDefaultLibrary() {
  let library = await prisma.library.findFirst({ where: { isDefault: true } })
  if (!library) {
    const namedDefault = await prisma.library.findUnique({ where: { name: 'Default' } })
    library = namedDefault
      ? await prisma.library.update({ where: { id: namedDefault.id }, data: { isDefault: true } })
      : await prisma.library.create({ data: { name: 'Default', isDefault: true } })
  }

  return library
}

export async function putNovelInLibrary(novelId: string, libraryId?: string) {
  const target = libraryId
    ? await prisma.library.findUnique({ where: { id: libraryId } })
    : await ensureDefaultLibrary()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  await prisma.$transaction([
    prisma.libraryNovel.deleteMany({ where: { novelId } }),
    prisma.libraryNovel.create({ data: { novelId, libraryId: target.id } })
  ])
  return target
}

export async function preferredLibraryForSource(sourceSite: string) {
  const preference = await prisma.sourcePreference.findUnique({ where: { sourceSite } })
  if (preference) {
    const library = await prisma.library.findUnique({ where: { id: preference.lastLibraryId } })
    if (library) return library
  }
  return ensureDefaultLibrary()
}

export async function rememberSourceLibrary(sourceSite: string, libraryId: string) {
  const library = await prisma.library.findUnique({ where: { id: libraryId } })
  if (!library) throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  await prisma.sourcePreference.upsert({
    where: { sourceSite },
    create: { sourceSite, lastLibraryId: libraryId },
    update: { lastLibraryId: libraryId }
  })
  return library
}

export async function putNovelInSourceLibrary(novelId: string, sourceSite: string, libraryId?: string) {
  const target = libraryId
    ? await rememberSourceLibrary(sourceSite, libraryId)
    : await preferredLibraryForSource(sourceSite)
  await prisma.$transaction([
    prisma.libraryNovel.deleteMany({ where: { novelId } }),
    prisma.libraryNovel.create({ data: { novelId, libraryId: target.id } })
  ])
  return target
}
