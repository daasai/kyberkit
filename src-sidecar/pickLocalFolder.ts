/**
 * Opens a native folder picker via the OS (Sidecar runs on the user's machine).
 * Used by browser UI: `POST /registry/pick-mount` returns the chosen absolute path.
 */

import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'

const TIMEOUT_MS = 120_000

export interface PickMountResult {
  path: string | null
  cancelled?: boolean
  error?: string
}

export function pickLocalDirectoryWithDialog(): PickMountResult {
  const plat = platform()
  try {
    if (plat === 'darwin') {
      const script =
        'try\nPOSIX path of (choose folder with prompt "选择 Library 挂载目录")\non error\nreturn ""\nend try'
      const r = spawnSync('osascript', ['-e', script], {
        encoding: 'utf-8',
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      })
      if (r.error) return { path: null, error: r.error.message }
      const out = (r.stdout ?? '').trim().replace(/\n+$/, '')
      if (!out) return { path: null, cancelled: true }
      const unquoted = /^"(.*)"$/.exec(out)?.[1] ?? out
      return { path: unquoted.trim() }
    }

    if (plat === 'win32') {
      const ps =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        '$f = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
        "$f.Description = '选择 Library 挂载目录'; " +
        'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath } else { "" }'
      const r = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], {
        encoding: 'utf-8',
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      })
      if (r.error?.code === 'ENOENT') {
        return { path: null, error: 'powershell.exe not found' }
      }
      if (r.error) return { path: null, error: r.error.message }
      const out = (r.stdout ?? '').trim()
      if (!out) return { path: null, cancelled: true }
      return { path: out }
    }

    const r = spawnSync(
      'zenity',
      ['--file-selection', '--directory', '--title=选择 Library 目录'],
      { encoding: 'utf-8', timeout: TIMEOUT_MS },
    )
    if (r.error?.code === 'ENOENT') {
      return { path: null, error: '未找到 zenity；请安装或手动填写路径' }
    }
    if (r.status !== 0) return { path: null, cancelled: true }
    const out = (r.stdout ?? '').trim()
    if (!out) return { path: null, cancelled: true }
    return { path: out }
  } catch (e: unknown) {
    return { path: null, error: e instanceof Error ? e.message : String(e) }
  }
}
