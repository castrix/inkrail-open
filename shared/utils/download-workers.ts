export type DownloadSource = string
export function downloadWorkerScope(source: string) {
 if (!/^[a-z][a-z0-9.-]{0,79}$/.test(source)) throw new Error('Invalid download source')
 return { type: { in: ['SCRAPE_CHAPTERS', 'DOWNLOAD_MANGA'] }, novel: { is: { sourceSite: source } } }
}
