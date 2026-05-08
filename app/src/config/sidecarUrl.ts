/** Kevin web UI → Bun Sidecar base URL (override in `.env`: `VITE_SIDECAR_URL`). */
export const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL ?? 'http://localhost:3001'

/** 将 spaceId 附加为 query string，供所有 sidecar API 请求使用。 */
export function qsSpace(spaceId: string): string {
  return spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : ''
}
