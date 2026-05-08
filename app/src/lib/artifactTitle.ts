export function inferArtifactTitle(markdown: string): string | null {
  const text = markdown.trim()
  if (!text) return null
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/^#{1,3}\s+(.*)$/)
    if (m?.[1]) return m[1].trim() || null
    // fallback: first non-empty line (but avoid code fences)
    if (!t.startsWith('```')) return t.slice(0, 80).trim() || null
  }
  return null
}

export function truncateTitle(title: string, max = 18): string {
  const t = title.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}
