/**
 * Smoke-test the compiled Kevin sidecar binary (same binary Tauri bundles as externalBin).
 * Uses repo .env if present. Fails if health is not ok.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appDir, '..')
const triple = execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim()
const ext = process.platform === 'win32' ? '.exe' : ''
const binary = path.join(appDir, 'src-tauri', 'binaries', `kevin-sidecar-${triple}${ext}`)

if (!fs.existsSync(binary)) {
  console.error('Missing sidecar binary. Run: npm run build:sidecar')
  process.exit(1)
}

const env = {
  ...process.env,
  KYBER_SPACES_ROOT: path.join(repoRoot, 'spaces'),
  KYBER_AGENT_DEF: path.join(repoRoot, 'agents', 'kevin', 'kevin.agent.ts'),
  KYBERKIT_ENV_FILE: fs.existsSync(path.join(repoRoot, '.env')) ? path.join(repoRoot, '.env') : '',
}

if (!env.KYBERKIT_ENV_FILE) delete env.KYBERKIT_ENV_FILE

const child = spawn(binary, [], {
  cwd: repoRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

const onExit = () => {
  try {
    child.kill('SIGTERM')
  } catch {
    /* ignore */
  }
}
process.on('exit', onExit)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ok = false
for (let i = 0; i < 40; i++) {
  await sleep(500)
  try {
    const res = await fetch('http://127.0.0.1:3001/health')
    if (res.ok) {
      const j = await res.json()
      if (j.status === 'ok') {
        ok = true
        console.log('[verify-kevin-release] health:', JSON.stringify(j))
        break
      }
    }
  } catch {
    /* still starting */
  }
}

onExit()
child.kill('SIGTERM')
await sleep(300)
try {
  child.kill('SIGKILL')
} catch {
  /* ignore */
}

if (!ok) {
  console.error('[verify-kevin-release] Sidecar did not become healthy on :3001 (port busy or bootstrap failed?)')
  process.exit(1)
}
console.log('[verify-kevin-release] PASS')
