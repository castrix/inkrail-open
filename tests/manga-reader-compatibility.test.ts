import { describe, it, expect, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), metadata: vi.fn() }))
vi.mock('../server/lib/prisma', () => ({ default: {novel:{findUnique:mocks.findUnique}} }))
vi.mock('../server/services/manga-stream', () => ({mangaStreamMetadata:mocks.metadata}))
import { readerManifest } from '../server/services/reader-manifest'
const local = { slug:'legacy',mediaType:'MANGA',sourceSite:'example-manga',sourceNovelId:'book',titleOriginal:'Saved',sourceUrl:'https://example.com',mangaPages:[{id:'local-1',sourcePageId:'one',position:1,imagePath:'saved.webp',downloadStatus:'COMPLETED',updatedAt:new Date(0)}] }
describe('reader compatibility', () => {
 beforeEach(()=>{vi.resetAllMocks();mocks.findUnique.mockResolvedValue(local)})
 it('keeps downloaded legacy source readers offline and unchanged', async()=>{
  const value=await readerManifest({sourceSite:'example-manga',sourceNovelId:'book'})
  expect(mocks.metadata).not.toHaveBeenCalled()
  expect(value.pages[0]).toMatchObject({sourcePageId:'one',archived:true,imageUrl:'/api/manga/pages/local-1/image?v=0'})
 })
 it('keeps library readers offline', async()=>{
  await readerManifest({slug:'legacy'});expect(mocks.metadata).not.toHaveBeenCalled()
 })
 it('adds chapter metadata and reuses downloaded files by stable page ID',async()=>{
  mocks.metadata.mockResolvedValue({titleOriginal:'Remote',sourceUrl:'https://example.com',pages:[{sourcePageId:'one',position:2},{sourcePageId:'two',position:3}],mangaChapters:[{sourceChapterId:'ch',sourcePageIds:['one','two']}]})
  const value=await readerManifest({sourceSite:'mangadex',sourceNovelId:'book',chapter:'ch'})
  expect(value).toHaveProperty('mangaChapters')
  expect(value.pages[0]).toMatchObject({sourcePageId:'one',position:2,archived:true})
  expect(value.pages[1]).toMatchObject({sourcePageId:'two',position:3,proxied:true})
 })
})
