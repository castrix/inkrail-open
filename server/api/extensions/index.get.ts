import { extensionManager } from '~/server/services/extensions'
export default defineEventHandler(() => extensionManager().list())
