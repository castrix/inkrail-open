import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataRoot } from './storage'
import { type DownloadSource } from '../../shared/utils/download-workers'

function settingsPath(source: DownloadSource) {
  if (!/^[a-z][a-z0-9.-]{0,79}$/.test(source)) throw new Error('Invalid source ID')
  return resolve(dataRoot(), 'settings', `download-${source}.json`)
}
export async function getDownloadSettings(source: DownloadSource) {
  try {
    const value = JSON.parse(await readFile(settingsPath(source), 'utf8'))
    return { source, rateLimit: value.rateLimit !== false }
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    return { source, rateLimit: true }
  }
}
export async function setDownloadSettings(source: DownloadSource, rateLimit: boolean) {
  const directory = resolve(dataRoot(), 'settings')
  await mkdir(directory, { recursive: true })
  const path = settingsPath(source), temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify({ rateLimit }))
  await rename(temporary, path)
  return { source, rateLimit }
}
export async function paceDownload(source: string, delayMs: number) {
  if ((await getDownloadSettings(source as DownloadSource)).rateLimit) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
}
export async function waitDownloadCooldown(source: DownloadSource, milliseconds: number) {
  const until = Date.now() + milliseconds
  while (Date.now() < until && (await getDownloadSettings(source)).rateLimit) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, until - Date.now())))
  }
}
