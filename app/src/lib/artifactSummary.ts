/** Client-side summary for hydrated artifacts (same rules as Sidecar). */
export function summarizeArtifactMarkdown(text: string): string {
  const t = text.trim()
  if (!t) return '未命名制品'
  const lines = t.split(/\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(/^#\s+(.+)/)
    if (m) {
      const title = m[1].trim()
      return title.length > 80 ? `${title.slice(0, 80)}…` : title || '未命名制品'
    }
  }
  const plain = t.replace(/\s+/g, ' ')
  return plain.length > 30 ? `${plain.slice(0, 30)}…` : plain
}
