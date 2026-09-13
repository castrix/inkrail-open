import { sourceList } from '~/server/services/extensions'
import { getDownloadSettings } from '~/server/services/download-settings'
export default defineEventHandler(async () => Promise.all((await sourceList()).map(s => getDownloadSettings(s.id))))
