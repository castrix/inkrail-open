export interface ReaderEntity {
  id: string
  type: 'CHARACTER' | 'PLACE' | string
  originalName: string
  translatedName?: string | null
  aliases: string[]
  description: string
  avatarUrl?: string | null
  fullBodyImageUrl?: string | null
  mentionedHere?: boolean
  firstIntroduction?: ReaderEntityContext | null
  lastAppearanceBeforeChapter?: ReaderEntityContext | null
}

export interface ReaderEntityContext {
  description: string
  chapter: { id: string, position: number, titleOriginal: string, titleTranslated?: string | null } | null
}

export type EntityTextSegment = { text: string, entity?: ReaderEntity }

const asciiWord = /[A-Za-z0-9]/

function isBoundary(text: string, start: number, length: number, alias: string) {
  if (!/[A-Za-z0-9]/.test(alias)) return true
  const before = start > 0 ? text[start - 1] : ''
  const after = text[start + length] || ''
  return (!before || !asciiWord.test(before)) && (!after || !asciiWord.test(after))
}

export function entityTextSegments(text: string, entities: ReaderEntity[]): EntityTextSegment[] {
  const candidates = entities.flatMap(entity => {
    const names = [entity.originalName, entity.translatedName, ...(entity.aliases || [])]
    return [...new Set(names.map(name => name?.trim()).filter((name): name is string => Boolean(name && name.length >= 2)))]
      .map(name => ({ name, folded: name.toLocaleLowerCase(), entity }))
  }).sort((left, right) => Number(Boolean(right.entity.mentionedHere)) - Number(Boolean(left.entity.mentionedHere)) || right.name.length - left.name.length)
  if (!candidates.length || !text) return [{ text }]

  const foldedText = text.toLocaleLowerCase()
  const result: EntityTextSegment[] = []
  let cursor = 0
  while (cursor < text.length) {
    let match: { index: number, name: string, entity: ReaderEntity } | undefined
    for (const candidate of candidates) {
      let index = foldedText.indexOf(candidate.folded, cursor)
      while (index >= 0 && !isBoundary(text, index, candidate.name.length, candidate.name)) index = foldedText.indexOf(candidate.folded, index + 1)
      if (index < 0) continue
      if (!match || index < match.index || (index === match.index && candidate.name.length > match.name.length)) match = { index, name: candidate.name, entity: candidate.entity }
    }
    if (!match) {
      result.push({ text: text.slice(cursor) })
      break
    }
    if (match.index > cursor) result.push({ text: text.slice(cursor, match.index) })
    result.push({ text: text.slice(match.index, match.index + match.name.length), entity: match.entity })
    cursor = match.index + match.name.length
  }
  return result.length ? result : [{ text }]
}
