import { invokeSource } from './extensions'
export const manualTwkanStatus = () => invokeSource('twkan', 'browser', { action: 'status' })
export const openManualTwkanSession = () => invokeSource('twkan', 'browser', { action: 'open' })
