export { refreshSourceDownloadPages } from './source-download'
import { refreshSourceDownloadPages } from './source-download'
export const refreshHitomiDownloadPages = (id: string, pages: any[]) => refreshSourceDownloadPages('hitomi', id, pages)
