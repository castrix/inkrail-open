import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import sharp from 'sharp'
import prisma from '~/server/lib/prisma'
import { sha256 } from '~/server/utils/content'
import { runCodex, translationConfig } from './translation'
import { characterSkinPath, dataRoot, writeAtomic } from './storage'
import { codexWorker } from './codex-app-server'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export async function refreshCharacterCandidates(novelId: string) {
  const progress = await prisma.readingProgress.findUnique({ where: { novelId }, include: { chapter: true } })
  const through = progress?.chapter.position || 0
  if (!through) return []
  const entries = await prisma.encyclopediaEntry.findMany({
    where: { novelId, type: 'CHARACTER', firstPosition: { lte: through } },
    include: { mentions: { where: { chapterPosition: { lte: through } }, orderBy: { chapterPosition: 'asc' } } }
  })
  const ranked = entries.map(entry => {
    const positions = [...new Set(entry.mentions.map(item => item.chapterPosition))]
    const last = positions.at(-1) || entry.firstPosition
    const span = Math.max(0, last - entry.firstPosition)
    const recency = Math.max(0, 5 - (through - last))
    return { entry, count: positions.length, last, score: positions.length * 10 + span * 0.4 + recency }
  }).sort((a, b) => b.score - a.score)
  await prisma.$transaction(ranked.map((item, index) => prisma.characterVisualProfile.upsert({
    where: { entryId: item.entry.id },
    create: { novelId, entryId: item.entry.id, importanceScore: item.score, mentionedChapterCount: item.count, firstPosition: item.entry.firstPosition, lastPosition: item.last, evidenceThroughPosition: through, status: index < 2 && item.count >= 2 ? 'SUGGESTED' : 'CANDIDATE' },
    update: { importanceScore: item.score, mentionedChapterCount: item.count, firstPosition: item.entry.firstPosition, lastPosition: item.last, evidenceThroughPosition: through }
  })))
  return prisma.characterVisualProfile.findMany({ where: { novelId }, include: { entry: true, skins: { orderBy: { introducedAtPosition: 'asc' } } }, orderBy: { importanceScore: 'desc' } })
}

export function initialSkinPrompt(name: string, originalName: string, description: string, preserveReference = false) {
  return [
    '$imagegen Create a matched pair of illustrations for the same character. Save the square close-up as character.png and the portrait-oriented full-body view as character-full.png in the current working directory.',
    `Character: ${name} (${originalName}), from a Chinese xianxia novel. Spoiler-safe known context: ${description || 'recurring central character'}.`,
    'Preserve all explicitly established physical traits from the provided context. Any unspecified hair, eye, facial colors, or other appearance details are artistic interpretation, not canon.',
    ...(preserveReference ? ['Use the attached approved avatar as the identity reference. Preserve the same face, apparent age, hair, and core character design while creating a distinct outfit/setting skin.'] : []),
    'Close-up: polished Chinese donghua / Chinese anime character design; elegant xianxia aesthetics; head-and-shoulders three-quarter portrait; refined linework; cinematic lighting; centered face readable as a small mobile avatar.',
    'Full body: preserve the exact same identity, apparent age, hair, outfit, colors, and rendering style; show head to boots in an elegant relaxed standing pose with a readable silhouette and restrained atmospheric backdrop.',
    'No text, logo, watermark, border, extra characters, modern clothing, Japanese school-uniform cues, or photorealism.'
  ].join('\n\n')
}

export async function queueCharacterImage(entryId: string) {
  const profile = await prisma.characterVisualProfile.findUnique({ where: { entryId }, include: { entry: { include: { mentions: { orderBy: { chapterPosition: 'desc' }, take: 1 } } }, skins: true } })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Refresh character candidates first' })
  const reference = profile.skins.find(skin => skin.isDefault && skin.status === 'APPROVED' && skin.imagePath) || profile.skins.find(skin => skin.status === 'APPROVED' && skin.imagePath)
  const prompt = initialSkinPrompt(profile.entry.translatedName || profile.entry.originalName, profile.entry.originalName, [profile.entry.mentions[0]?.description, profile.entry.mentions[0]?.physicalDescription].filter(Boolean).join(' '), Boolean(reference))
  const description = profile.entry.mentions[0]?.description || 'Initial known appearance'
  const skin = await prisma.characterSkin.create({ data: { profileId: profile.id, name: profile.skins.length ? `Skin ${profile.skins.length + 1}` : 'First appearance', introducedAtPosition: profile.skins.length ? profile.evidenceThroughPosition : profile.firstPosition, description, prompt, status: 'QUEUED', isDefault: !profile.skins.length, origin: 'MANUAL' } })
  await prisma.characterVisualProfile.update({ where: { id: profile.id }, data: { status: 'QUEUED', error: null } })
  const job = await prisma.scrapeJob.create({ data: { novelId: profile.novelId, type: 'GENERATE_CHARACTER_IMAGE', payload: skin.id, total: 1, priority: 20 } })
  return { job, skin }
}

export async function queueCharacterSkinDetection(entryId: string) {
  const profile = await prisma.characterVisualProfile.findUnique({ where: { entryId } })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Refresh character candidates first' })
  const active = await prisma.scrapeJob.findFirst({ where: { type: 'DETECT_CHARACTER_SKINS', payload: profile.id, status: { in: ['PENDING', 'RUNNING'] } } })
  if (active) return { job: active, queued: false }
  await prisma.characterVisualProfile.update({ where: { id: profile.id }, data: { skinDetectionStatus: 'QUEUED', skinDetectionError: null } })
  const job = await prisma.scrapeJob.create({ data: { novelId: profile.novelId, type: 'DETECT_CHARACTER_SKINS', payload: profile.id, total: 1, priority: 15 } })
  return { job, queued: true }
}

export async function queueDetectedSkinImages(options: { skinIds?: string[], entryId?: string, scope?: string }) {
  const where: any = { status: { in: ['PROPOSED', 'FAILED'] } }
  if (options.skinIds?.length) where.id = { in: options.skinIds }
  else if (options.entryId) where.profile = { entryId: options.entryId }
  else throw createError({ statusCode: 400, statusMessage: 'Choose a character or one or more skins' })
  if (options.scope === 'unlocked') {
    const profile = await prisma.characterVisualProfile.findUnique({ where: { entryId: options.entryId! }, include: { novel: { include: { readingProgress: { include: { chapter: true } } } } } })
    where.introducedAtPosition = { lte: profile?.novel.readingProgress?.chapter.position || 0 }
  }
  const skins = await prisma.characterSkin.findMany({ where, include: { profile: true }, orderBy: { introducedAtPosition: 'asc' } })
  if (!skins.length) return { queued: 0 }
  await prisma.$transaction([
    ...skins.map(skin => prisma.characterSkin.update({ where: { id: skin.id }, data: { status: 'QUEUED', error: null } })),
    ...skins.map(skin => prisma.scrapeJob.create({ data: { novelId: skin.profile.novelId, type: 'GENERATE_CHARACTER_IMAGE', payload: skin.id, total: 1, priority: 20 } }))
  ])
  return { queued: skins.length }
}

const SKIN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { proposals: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    introducedAtPosition: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' },
    changeType: { type: 'string' }, confidence: { type: 'number' }, evidence: { type: 'array', items: { type: 'string' } }
  }, required: ['introducedAtPosition', 'name', 'description', 'changeType', 'confidence', 'evidence'] } } }, required: ['proposals']
}

export async function processCharacterSkinDetectionJob(jobId: string) {
  const job = await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, error: null } })
  if (!job.payload) throw new Error('Skin detection job has no profile')
  const profile = await prisma.characterVisualProfile.findUniqueOrThrow({ where: { id: job.payload }, include: { entry: true, novel: true, skins: true } })
  const workdir = resolve(dataRoot(), 'character-skin-detection', job.id)
  try {
    await prisma.characterVisualProfile.update({ where: { id: profile.id }, data: { skinDetectionStatus: 'RUNNING', skinDetectionError: null } })
    const chapters = await prisma.chapter.findMany({ where: { novelId: profile.novelId, scrapeStatus: 'COMPLETED', sourcePath: { not: null } }, orderBy: { position: 'asc' }, select: { position: true, sourcePath: true } })
    const aliases = [profile.entry.originalName, ...JSON.parse(profile.entry.aliasesJson || '[]')].filter(Boolean)
    const visualWords = /衣|袍|裙|甲|髮|发|眸|眼|容貌|面容|模樣|样貌|外貌|白髮|白发|黑髮|黑发|紅衣|红衣|白衣|青衣|紫衣|金袍|帝袍|龍袍|龙袍|面具|斗笠|易容|化身|分身|形態|形态|鎧|铠|冠|傷|伤|疤|老去|少年|青年/
    const observations: string[] = []
    for (const chapter of chapters) {
      const source = await readFile(chapter.sourcePath!, 'utf8').catch(() => '')
      for (const paragraph of source.split(/\r?\n\s*\r?\n/)) {
        if (aliases.some((name: string) => paragraph.includes(name)) && visualWords.test(paragraph)) observations.push(`[Chapter ${chapter.position}] ${paragraph.replace(/^#+\s*/, '').slice(0, 700)}`)
        if (observations.length >= 220) break
      }
      if (observations.length >= 220) break
    }
    await mkdir(workdir, { recursive: true })
    await writeAtomic(resolve(workdir, 'schema.json'), JSON.stringify(SKIN_SCHEMA))
    const target = translationConfig().targetLanguage
    const prompt = `Analyze the Chinese-source excerpts for ${profile.entry.originalName}. Identify only visually meaningful, persistent character designs or transformations suitable as distinct illustration skins. Ignore mood, lighting, dirt, brief damage, and ordinary one-off clothing. Existing skins occur at chapters: ${profile.skins.map(s => s.introducedAtPosition).join(', ') || 'none'}. Return concise spoiler-free ${target} names and visual descriptions. Names and descriptions must be fully written in ${target} with no Han characters; only the evidence field may remain Chinese. The introduction position must be the earliest exact excerpt that establishes the design. Evidence should be short Chinese excerpts. Do not describe plot outcomes.\n\n${observations.join('\n\n')}`
    const config = translationConfig()
    await runCodex(workdir, prompt, config.model, config.reasoningEffort, job.id)
    const result = JSON.parse(await readFile(resolve(workdir, 'result.json'), 'utf8')) as { proposals: Array<{ introducedAtPosition: number, name: string, description: string, changeType: string, confidence: number, evidence: string[] }> }
    let created = 0
    const occupiedPositions = profile.skins.map(skin => ({ position: skin.introducedAtPosition, changeType: skin.changeType, isDefault: skin.isDefault }))
    for (const proposal of result.proposals || []) {
      if (!Number.isInteger(proposal.introducedAtPosition) || proposal.introducedAtPosition < 1) continue
      const normalizedType = proposal.changeType.toUpperCase()
      if (occupiedPositions.some(item => Math.abs(item.position - proposal.introducedAtPosition) <= 1 && (item.isDefault || item.changeType === normalizedType))) continue
      const detectionKey = sha256(`${profile.id}:${proposal.introducedAtPosition}:${proposal.changeType.toUpperCase()}`)
      const displayName = profile.entry.translatedName || profile.entry.originalName
      const localizedName = proposal.name.replaceAll(profile.entry.originalName, displayName)
      const localizedDescription = proposal.description.replaceAll(profile.entry.originalName, displayName)
      const prompt = initialSkinPrompt(displayName, profile.entry.originalName, localizedDescription, true)
      const existing = await prisma.characterSkin.findUnique({ where: { detectionKey } })
      if (!existing) { await prisma.characterSkin.create({ data: { profileId: profile.id, introducedAtPosition: proposal.introducedAtPosition, name: localizedName, description: localizedDescription, changeType: normalizedType, confidence: Math.max(0, Math.min(1, proposal.confidence)), evidenceJson: JSON.stringify(proposal.evidence || []), detectionKey, origin: 'DETECTED', prompt, status: 'PROPOSED' } }); occupiedPositions.push({ position: proposal.introducedAtPosition, changeType: normalizedType, isDefault: false }); created++ }
    }
    await prisma.$transaction([
      prisma.characterVisualProfile.update({ where: { id: profile.id }, data: { skinDetectionStatus: 'COMPLETED', skinDetectedAt: new Date(), skinDetectionError: null } }),
      prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', progress: 1, completedAt: new Date(), error: created ? null : 'Scan completed; no new persistent visual changes found.' } })
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.$transaction([
      prisma.characterVisualProfile.update({ where: { id: profile.id }, data: { skinDetectionStatus: 'FAILED', skinDetectionError: message } }),
      prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: message, completedAt: new Date() } })
    ])
    throw error
  } finally { await rm(workdir, { recursive: true, force: true }).catch(() => undefined) }
}

async function runCodexImage(workdir: string, prompt: string, referenceImage?: string | null) {
  await codexWorker.run({ cwd: workdir, prompt, referenceImage, sandbox: 'workspace-write' })
}

export async function processCharacterImageJob(jobId: string) {
  const job = await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, error: null } })
  if (!job.payload) throw new Error('Character image job has no skin')
  const skin = await prisma.characterSkin.findUniqueOrThrow({ where: { id: job.payload }, include: { profile: { include: { novel: true, entry: true, skins: true } } } })
  const workdir = resolve(dataRoot(), 'character-image-work', job.id)
  try {
    await mkdir(workdir, { recursive: true })
    await prisma.$transaction([
      prisma.characterSkin.update({ where: { id: skin.id }, data: { status: 'GENERATING', error: null } }),
      prisma.characterVisualProfile.update({ where: { id: skin.profileId }, data: { status: 'GENERATING', error: null } })
    ])
    await writeAtomic(resolve(workdir, 'prompt.txt'), skin.prompt)
    const reference = skin.profile.skins.find(item => item.id !== skin.id && item.isDefault && item.status === 'APPROVED' && item.imagePath)
      || skin.profile.skins.find(item => item.id !== skin.id && item.status === 'APPROVED' && item.imagePath)
    await runCodexImage(workdir, skin.prompt, reference?.imagePath)
    const files = await readdir(workdir)
    const generated = files.includes('character.png') ? 'character.png' : files.find(file => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()) && !file.includes('full'))
    if (!generated) throw new Error('Codex finished without creating an image file')
    const extension = extname(generated).slice(1).toLowerCase()
    const output = characterSkinPath(skin.profile.novel, skin.profile.entryId, skin.id, extension)
    await mkdir(resolve(output, '..'), { recursive: true })
    await copyFile(resolve(workdir, generated), output)
    const optimized = characterSkinPath(skin.profile.novel, skin.profile.entryId, `${skin.id}.optimized`, 'webp')
    await sharp(output).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(optimized)
    const fullBodyGenerated = files.includes('character-full.png') ? 'character-full.png' : files.find(file => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()) && file.includes('full'))
    let fullBodyPath: string | null = null
    let fullBodyOptimizedPath: string | null = null
    if (fullBodyGenerated) {
      const fullExtension = extname(fullBodyGenerated).slice(1).toLowerCase()
      fullBodyPath = characterSkinPath(skin.profile.novel, skin.profile.entryId, `${skin.id}.full`, fullExtension)
      fullBodyOptimizedPath = characterSkinPath(skin.profile.novel, skin.profile.entryId, `${skin.id}.full.optimized`, 'webp')
      await copyFile(resolve(workdir, fullBodyGenerated), fullBodyPath)
      await sharp(fullBodyPath).resize({ width: 768, height: 1152, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(fullBodyOptimizedPath)
    }
    const identityEvidence = await prisma.encyclopediaMention.findFirst({
      where: { entryId: skin.profile.entryId, chapterPosition: { lte: skin.introducedAtPosition } }, orderBy: { chapterPosition: 'desc' }
    })
    const identity = {
      grounded: [identityEvidence?.description, identityEvidence?.physicalDescription].filter(Boolean),
      interpreted: ['Visual details not explicitly established by the Chinese source'],
      evidenceThroughPosition: identityEvidence?.chapterPosition || skin.introducedAtPosition
    }
    const generatedAt = new Date()
    await prisma.$transaction([
      prisma.characterSkin.update({ where: { id: skin.id }, data: { status: 'APPROVED', imagePath: output, optimizedPath: optimized, fullBodyPath, fullBodyOptimizedPath, generatedAt, approvedAt: generatedAt, error: fullBodyPath ? null : 'Close-up generated; full-body companion was not created.' } }),
      prisma.characterVisualProfile.update({ where: { id: skin.profileId }, data: { status: 'APPROVED', visualIdentityJson: JSON.stringify(identity), error: null } }),
      prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', progress: 1, completedAt: new Date() } })
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.$transaction([
      prisma.characterSkin.update({ where: { id: skin.id }, data: { status: 'FAILED', error: message } }),
      prisma.characterVisualProfile.update({ where: { id: skin.profileId }, data: { status: 'FAILED', error: message } }),
      prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: message, completedAt: new Date() } })
    ])
    throw error
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined)
  }
}
