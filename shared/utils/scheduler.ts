const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export function nextJakartaRun(localTime = '06:00', from = new Date()) {
  const [hour, minute] = localTime.split(':').map(Number)
  const jakartaNow = new Date(from.getTime() + JAKARTA_OFFSET_MS)
  return new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate() + 1, hour, minute) - JAKARTA_OFFSET_MS)
}
