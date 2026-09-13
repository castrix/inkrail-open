import { createHash } from 'node:crypto'

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

export function slugify(value: string) {
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const slug = ascii.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return (slug || 'novel').slice(0, 80)
}

export function chapterMarkdown(title: string, paragraphs: string[]) {
  return `# ${title}\n\n${paragraphs.join('\n\n')}\n`
}
