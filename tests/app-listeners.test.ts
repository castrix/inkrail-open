import { describe, expect, it } from 'vitest'
import { identifyWebApp, parseListeningPorts } from '../server/utils/app-listeners'

describe('app listener discovery', () => {
  it('parses and groups Windows IPv4 and IPv6 listeners', () => {
    const result = parseListeningPorts(`
      TCP    0.0.0.0:32400       0.0.0.0:0       LISTENING       41736
      TCP    [::]:32400          [::]:0          LISTENING       41736
      TCP    127.0.0.1:8080      0.0.0.0:0       LISTENING       1234
      TCP    127.0.0.1:50000     127.0.0.1:443   ESTABLISHED     99
    `)
    expect(result).toEqual([
      { port: 8080, pid: 1234, addresses: ['127.0.0.1'] },
      { port: 32400, pid: 41736, addresses: ['0.0.0.0', '::'] }
    ])
  })

  it('recognizes known apps by port or page title', () => {
    expect(identifyWebApp(32400).name).toBe('Plex')
    expect(identifyWebApp(43210, 'qBittorrent Web UI').name).toBe('qBittorrent')
  })
})
