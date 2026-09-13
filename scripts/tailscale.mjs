import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const executable = process.env.TAILSCALE_EXE || 'C:\\Program Files\\Tailscale\\tailscale.exe'
const commands = {
  serve: ['serve', '--bg', '4000'],
  status: ['serve', 'status'],
  off: ['serve', 'off'],
}

const action = process.argv[2]
if (!(action in commands)) {
  console.error('Usage: node scripts/tailscale.mjs <serve|status|off>')
  process.exit(2)
}

if (!existsSync(executable)) {
  console.error(`Tailscale CLI was not found at ${executable}. Set TAILSCALE_EXE to its full path.`)
  process.exit(1)
}

const result = spawnSync(executable, commands[action], { stdio: 'inherit', windowsHide: true })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
