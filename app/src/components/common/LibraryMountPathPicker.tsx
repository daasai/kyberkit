/**
 * Library 挂载路径：Tauri 用系统对话框；浏览器通过本机 Sidecar 的 `POST /registry/pick-mount` 调起系统选目录。
 */

import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { SIDECAR_URL } from '../../config/sidecarUrl'

export function LibraryMountPathPicker({
  value,
  onChange,
  disabled,
  inputId,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  inputId?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [pickBusy, setPickBusy] = useState(false)
  const [sidecarPickErr, setSidecarPickErr] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const showNativePicker = mounted && isTauri()
  const showSidecarPick = mounted && !isTauri()

  const pickFolder = async () => {
    if (!showNativePicker || disabled) return
    setPickBusy(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected === null) return
      const path = Array.isArray(selected) ? selected[0] : selected
      if (typeof path === 'string' && path.trim()) onChange(path.trim())
    } catch {
      /* dialog unavailable */
    } finally {
      setPickBusy(false)
    }
  }

  const pickFolderViaSidecar = async () => {
    if (!showSidecarPick || disabled) return
    setSidecarPickErr(null)
    setPickBusy(true)
    try {
      const res = await fetch(`${SIDECAR_URL}/registry/pick-mount`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        path?: string | null
        cancelled?: boolean
        error?: string
      }
      if (!res.ok) {
        setSidecarPickErr(typeof data.error === 'string' ? data.error : `选择失败 (${res.status})`)
        return
      }
      if (data.cancelled || data.path == null || data.path === '') return
      if (typeof data.path === 'string' && data.path.trim()) onChange(data.path.trim())
    } catch {
      setSidecarPickErr('无法连接 Sidecar，请确认本机服务已启动')
    } finally {
      setPickBusy(false)
    }
  }

  const btnStyle = {
    alignSelf: 'flex-start',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--color-outline-variant)',
    background: 'var(--color-surface)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled || pickBusy ? 'not-allowed' : 'pointer',
    color: 'var(--color-on-surface)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
      {showNativePicker && (
        <button
          type="button"
          disabled={disabled || pickBusy}
          onClick={() => void pickFolder()}
          style={btnStyle}
        >
          {pickBusy ? '打开选择器…' : '选择文件夹…'}
        </button>
      )}
      {showSidecarPick && (
        <button
          type="button"
          disabled={disabled || pickBusy}
          onClick={() => void pickFolderViaSidecar()}
          style={btnStyle}
        >
          {pickBusy ? '打开本机选择器…' : '在本机选择目录…'}
        </button>
      )}
      <div>
        <label
          htmlFor={inputId}
          style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-on-surface-variant)' }}
        >
          {showNativePicker
            ? '路径（可由上方选择器自动填入，亦可手动编辑）'
            : showSidecarPick
              ? '路径（可由 Sidecar 在本机弹出系统对话框，亦可手动粘贴绝对路径）'
              : '文档库目录（请填写本机绝对路径）'}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="/Users/you/Documents/KevinVault"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
            fontSize: '13px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          }}
        />
      </div>
      {sidecarPickErr ? (
        <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--color-error)' }}>{sidecarPickErr}</p>
      ) : null}
      {showSidecarPick && !sidecarPickErr ? (
        <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--color-on-surface-variant)' }}>
          需在本机运行 Sidecar；远程部署时请直接粘贴服务器可访问的绝对路径，或使用 Kevin 桌面应用。
        </p>
      ) : null}
    </div>
  )
}
