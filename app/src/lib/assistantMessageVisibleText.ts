/**
 * Derive chat-bubble markdown from raw assistant `content`.
 * Artifact body streams to the center canvas only; placeholders and `<artifact>` blocks are removed here.
 */
export function visibleAssistantFromMessage(raw: string, artifactStreaming: boolean): string {
  let t = raw
    .replace(/\n*__ARTIFACT_PLACEHOLDER__\n*/g, '\n')
    .replace(/__ARTIFACT_PLACEHOLDER__/g, '')
  t = t.replace(/<artifact[^>]*>[\s\S]*?<\/artifact>/gi, '')
  if (artifactStreaming) {
    const open = t.search(/<artifact\b/i)
    if (open >= 0) t = t.slice(0, open)
  }
  return t.trimEnd()
}
