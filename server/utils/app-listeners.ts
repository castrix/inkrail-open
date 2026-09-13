export type AppListener = { port: number, pid: number | null, addresses: string[] }

export function parseListeningPorts(output: string): AppListener[] {
  const grouped = new Map<number, { pids: Set<number>, addresses: Set<string> }>()
  for (const raw of output.split(/\r?\n/)) {
    const columns = raw.trim().split(/\s+/)
    if (columns[0]?.toUpperCase() !== 'TCP' || columns[3]?.toUpperCase() !== 'LISTENING') continue
    const endpoint = columns[1] || ''
    const separator = endpoint.lastIndexOf(':')
    const port = Number(endpoint.slice(separator + 1))
    if (separator < 0 || !Number.isInteger(port) || port < 1 || port > 65535) continue
    const address = endpoint.slice(0, separator).replace(/^\[|\]$/g, '')
    const pid = Number(columns[4])
    const entry = grouped.get(port) || { pids: new Set<number>(), addresses: new Set<string>() }
    entry.addresses.add(address)
    if (Number.isInteger(pid) && pid > 0) entry.pids.add(pid)
    grouped.set(port, entry)
  }
  return [...grouped.entries()]
    .map(([port, entry]) => ({ port, pid: entry.pids.values().next().value || null, addresses: [...entry.addresses] }))
    .sort((a, b) => a.port - b.port)
}

export function identifyWebApp(port: number, title = '', server = '') {
  const clue = `${title} ${server}`.toLowerCase()
  if (port === 32400 || clue.includes('plex')) return { name: 'Plex', description: 'Media server', icon: 'P', known: true }
  if (clue.includes('qbittorrent')) return { name: 'qBittorrent', description: 'Torrent Web UI', icon: 'qB', known: true }
  if (port === 8096 || clue.includes('jellyfin')) return { name: 'Jellyfin', description: 'Media server', icon: 'J', known: true }
  if (port === 8989 || clue.includes('sonarr')) return { name: 'Sonarr', description: 'Series manager', icon: 'S', known: true }
  if (port === 7878 || clue.includes('radarr')) return { name: 'Radarr', description: 'Movie manager', icon: 'R', known: true }
  if (port === 9696 || clue.includes('prowlarr')) return { name: 'Prowlarr', description: 'Indexer manager', icon: 'Pr', known: true }
  if (port === 4000 || clue.includes('inkrail')) return { name: 'Inkrail', description: 'Private reading room', icon: 'I', known: true }
  return { name: title.trim() || `Web service on ${port}`, description: server.trim() || 'Local web application', icon: String(port).slice(0, 2), known: false }
}
