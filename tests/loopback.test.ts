import { describe, expect, it } from 'vitest'
import { isLoopbackHost } from '../server/utils/loopback'

describe('loopback-only actions', () => {
  it.each(['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000', '[::1]', '[::1]:3000'])('accepts %s', host => {
    expect(isLoopbackHost(host)).toBe(true)
  })

  it.each([undefined, '', 'inkrail.tailnet.ts.net', '100.64.0.2:3000', 'localhost.example.com'])('rejects %s', host => {
    expect(isLoopbackHost(host)).toBe(false)
  })
})
