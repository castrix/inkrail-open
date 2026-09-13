import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { planTachimangaImport } from '../shared/utils/tachimanga'

const args = process.argv.slice(2)
const file = args.find(arg => !arg.startsWith('--'))
if (!file || args.some(arg => arg.startsWith('--') && arg !== '--apply')) {
  throw new Error('Usage: npm run import:tachimanga -- backup.tmb [--apply]')
}
const entries = JSON.parse(execFileSync(process.env.PYTHON || 'python', [
  fileURLToPath(new URL('./read-tachimanga.py', import.meta.url)), resolve(file)
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const plan = planTachimangaImport(entries)
const reportDirectory = resolve('data/backups')
await mkdir(reportDirectory, { recursive: true })
const reportPath = resolve(reportDirectory, `tachimanga-${Date.now()}.json`)
const summary = {
  total: plan.total, importable: plan.supported.length, duplicates: plan.duplicates,
  skipped: plan.skipped.length,
  libraries: [...new Set(plan.supported.flatMap(item => item.libraries))],
  bySource: Object.fromEntries(['nhentai', 'hitomi', 'hentainexus'].map(source => [source, plan.supported.filter(item => item.metadata.sourceSite === source).length]))
}
// Write the complete preview before any database mutation, including unsupported bookmarks.
await writeFile(reportPath, JSON.stringify({ mode: 'preview', summary, ...plan }, null, 2))
console.log(JSON.stringify(summary, null, 2))
console.log(`Report: ${reportPath}`)
if (!args.includes('--apply')) {
  console.log('Preview only. Add --apply to import bookmarks and categories.')
} else {
  const prisma = new PrismaClient()
  try {
    const result = await prisma.$transaction(async tx => {
      let created = 0, existing = 0, membershipsAdded = 0
      const libraries = new Map<string, string>()
      for (const name of summary.libraries) {
        const library = await tx.library.upsert({ where: { name }, create: { name }, update: {} })
        libraries.set(name, library.id)
      }
      for (const item of plan.supported) {
        const { sourceSite, sourceNovelId } = item.metadata
        let novel = await tx.novel.findUnique({ where: { sourceSite_sourceNovelId: { sourceSite, sourceNovelId } } })
        if (novel) existing++
        else {
          const base = `tachimanga-${sourceSite}-${sourceNovelId}`
          let slug = base, suffix = 1
          while (await tx.novel.findUnique({ where: { slug } })) slug = `${base}-${suffix++}`
          novel = await tx.novel.create({ data: { ...item.metadata, slug } })
          created++
        }
        for (const name of item.libraries) {
          const libraryId = libraries.get(name)!
          const key = { libraryId, novelId: novel.id }
          if (!await tx.libraryNovel.findUnique({ where: { libraryId_novelId: key } })) {
            await tx.libraryNovel.create({ data: key })
            membershipsAdded++
          }
        }
      }
      return { created, existing, membershipsAdded }
    }, { timeout: 120_000 })
    await writeFile(reportPath, JSON.stringify({ mode: 'applied', summary, result, ...plan }, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally { await prisma.$disconnect() }
}
