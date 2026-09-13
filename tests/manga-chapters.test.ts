import { describe, it, expect } from 'vitest'
import { parseMangaChapters } from '../shared/utils/manga-chapters'
const pages = [{sourcePageId:'a:1'}, {sourcePageId:'b:1'}]
const chapter = (id: string, position: number) => ({sourceChapterId:id,titleOriginal:`Chapter ${id}`,position,sourcePageIds:[`${id}:1`]})
describe('optional manga chapters', () => {
  it('keeps old manga without chapter metadata supported', () => {
    expect(parseMangaChapters(undefined, pages)).toBeUndefined()
    expect(parseMangaChapters([], pages)).toEqual([])
  })
  it('orders chapters while preserving stable page identities', () => {
    expect(parseMangaChapters([chapter('b',2),chapter('a',1)],pages)?.map(c=>c.sourcePageIds)).toEqual([['a:1'],['b:1']])
  })
  it('rejects unknown, duplicate and missing page references', () => {
    expect(()=>parseMangaChapters([chapter('c',1)],pages)).toThrow()
    expect(()=>parseMangaChapters([chapter('a',1),chapter('a',2)],pages)).toThrow()
    expect(()=>parseMangaChapters([chapter('a',1)],pages)).toThrow()
  })
})
