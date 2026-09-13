const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export function nextJakartaRun(localTime = '06:00', from = new Date()) {
  const [hour, minute] = localTime.split(':').map(Number)
  const jakartaNow = new Date(from.getTime() + JAKARTA_OFFSET_MS)
  return new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate() + 1, hour, minute) - JAKARTA_OFFSET_MS)
}

export function validTimezone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true } catch { return false }
}

/** Tomorrow in the chosen zone; a missing DST time runs at the next valid minute. */
export function nextZonedRun(localTime = '06:00', timezone = 'Asia/Jakarta', from = new Date()) {
  if (!validTimezone(timezone) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error('Invalid schedule time or timezone')
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const parts = (date: Date) => Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]))
  const today = parts(from)
  const tomorrow = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + 1))
  const day = tomorrow.toISOString().slice(0, 10)
  for (let time = tomorrow.getTime() - 14 * 3600000; time < tomorrow.getTime() + 38 * 3600000; time += 60000) {
    const p = parts(new Date(time))
    if (`${p.year}-${p.month}-${p.day}` === day && `${p.hour}:${p.minute}` >= localTime) return new Date(time)
  }
  throw new Error('No valid time found on the scheduled day')
}
