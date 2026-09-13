import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
if (!files.length) throw new Error('No tracked files to audit; stage the public source first')
const forbidden = /(^|\/)(data|work|node_modules|\.nuxt|\.output[^/]*)(\/|$)|(^|\/)\.env(?!\.example$)|\.(?:db|sqlite\d*|tmb|log|pem|key)$/i
const failures = []
for (const path of files) {
 if (forbidden.test(path)) { failures.push(`${path}: private/generated file`); continue }
 if (!/\.(?:ts|js|mjs|vue|json|md|yml|ps1|py)$/.test(path)) continue
 const text = await readFile(path, 'utf8')
 if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push(`${path}: private key`)
 if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,})\b/.test(text)) failures.push(`${path}: credential-like token`)
 if (/[A-Za-z]:[\\/]Users[\\/](?!Public\b|<)[^\\/\s]+/.test(text)) failures.push(`${path}: personal home path`)
}
if (failures.length) throw new Error(failures.join('\n'))
console.log(`Public export audit passed for ${files.length} tracked files. This supplements, not replaces, review.`)
