/**
 * Compile Kevin Bun sidecar to a native binary for Tauri `externalBin`.
 * Output: app/src-tauri/binaries/kevin-sidecar-<rustc-host-tuple>
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appDir, '..')
const outDir = path.join(appDir, 'src-tauri', 'binaries')
const entry = path.join(repoRoot, 'src-sidecar', 'index.ts')

const triple = execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim()
if (!triple) {
  console.error('Failed to read rustc host tuple')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const ext = process.platform === 'win32' ? '.exe' : ''
const tmp = path.join(outDir, `kevin-sidecar-build-tmp${ext}`)
const final = path.join(outDir, `kevin-sidecar-${triple}${ext}`)

if (fs.existsSync(tmp)) fs.rmSync(tmp)
if (fs.existsSync(final)) fs.rmSync(final)

console.log('[compile-kevin-sidecar] Compiling', entry, '→', final)
execSync(`bun build --compile "${entry}" --outfile "${tmp}"`, { stdio: 'inherit', cwd: repoRoot })
fs.renameSync(tmp, final)
console.log('[compile-kevin-sidecar] Done:', final)
