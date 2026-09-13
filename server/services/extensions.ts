import { resolve } from 'node:path'
import { ExtensionManager } from '../../extensions/runtime.mjs'
import { dataRoot } from './storage'

const globalExtensions = globalThis as unknown as { extensionManager?: ExtensionManager }
export function extensionManager(): ExtensionManager {
  return globalExtensions.extensionManager ||= new ExtensionManager(dataRoot())
}
export async function sourceList(): Promise<any[]> {
  if (process.env.INKRAIL_CORE_URL) return coreCall('list', {})
  return extensionManager().sources()
}
async function coreCall(method: string, params: any): Promise<any> {
  const response = await fetch(`${process.env.INKRAIL_CORE_URL}/api/internal/source`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-inkrail-worker': process.env.INKRAIL_WORKER_TOKEN || '' },
    body: JSON.stringify({ method, ...params }), signal: AbortSignal.timeout(70000)
  })
  const body = await response.json() as any
  if (!response.ok) throw Object.assign(new Error(body.data?.message || body.statusMessage || 'Source request failed'), { code: body.data?.code, statusCode: body.statusCode })
  return body
}
export async function invokeSource(source: string, method: string, params: any = {}): Promise<any> {
  if (process.env.INKRAIL_CORE_URL) return coreCall(method, { source, params })
  try { return await extensionManager().invoke(source, method, params) }
  catch (error: any) {
    throw Object.assign(error, { statusCode: error.code === 'SOURCE_UNAVAILABLE' ? 503 : error.statusCode || 502 })
  }
}
export async function sourceManifest(id: string): Promise<any> {
  const manifest = (await sourceList()).find(source => source.id === id)
  if (!manifest) throw Object.assign(new Error('Source unavailable. Install or enable its extension to resume.'), { code: 'SOURCE_UNAVAILABLE', statusCode: 503 })
  return manifest
}
export async function sourceAsset(source: string, url: string, referer?: string): Promise<Buffer> {
  const result = await invokeSource(source, 'asset', { url, referer })
  return Buffer.from(result.base64, 'base64')
}
