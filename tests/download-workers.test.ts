import { describe, it, expect } from 'vitest'
import { downloadWorkerScope } from '../shared/utils/download-workers'
describe('dynamic source worker scopes', () => {
 it('accepts externally installed source IDs and limits work to that source', () => expect(downloadWorkerScope('community.example')).toEqual({ type: { in: ['SCRAPE_CHAPTERS','DOWNLOAD_MANGA'] }, novel: { is: { sourceSite: 'community.example' } } }))
 it('rejects invalid source identifiers', () => expect(() => downloadWorkerScope('../escape')).toThrow())
})
