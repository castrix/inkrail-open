export function isLoopbackHost(host: string | undefined) {
  if (!host) return false
  const value = host.trim().toLowerCase()
  return /^localhost(?::\d+)?$/.test(value)
    || /^127\.0\.0\.1(?::\d+)?$/.test(value)
    || /^\[::1\](?::\d+)?$/.test(value)
}
