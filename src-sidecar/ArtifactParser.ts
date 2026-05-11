/**
 * ArtifactParser — intercepts <artifact>...</artifact> blocks in the LLM text stream.
 *
 * Transforms incoming text_delta events into a mix of:
 *   text_delta      — regular conversational text (outside artifact)
 *   artifact_start  — opening <artifact> detected
 *   artifact_delta  — content inside <artifact>
 *   artifact_end    — closing </artifact> detected
 *
 * Designed for streaming: holds a lookahead buffer to avoid emitting partial tags.
 */

export type SidecarTextEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'artifact_start' }
  | { type: 'artifact_delta'; text: string }
  | { type: 'artifact_end' }

const OPEN_TAG = '<artifact>'
const CLOSE_TAG = '</artifact>'

/**
 * While already inside an artifact, the model sometimes emits a second `<artifact...>`
 * (often after meta text like "以下是完整文档"). That must not reach the canvas as body:
 * we strip complete nested opening tags only.
 */
function stripNestedArtifactOpensInArtifactBody(buf: string): string {
  let s = buf
  while (true) {
    const m = s.match(/<artifact\b/i)
    if (!m || m.index === undefined) break
    const i = m.index
    const tail = s.slice(i)
    const gt = tail.indexOf('>')
    if (gt < 0) break
    const after = i + gt + 1
    s = s.slice(0, i) + s.slice(after).replace(/^\r?\n/, '')
  }
  return s
}

/** Longest suffix of `buf` that is a proper prefix of `tag` (streaming partial tag holdback). */
function tagPrefixHoldback(buf: string, tag: string): number {
  const max = Math.min(buf.length, tag.length - 1)
  for (let k = max; k >= 1; k--) {
    if (buf.endsWith(tag.slice(0, k))) return k
  }
  return 0
}

export class ArtifactParser {
  private buf = ''
  private mode: 'text' | 'artifact' = 'text'

  /** Feed new text from a text_delta event. Returns derived events to emit. */
  feed(text: string): SidecarTextEvent[] {
    this.buf += text
    if (this.mode === 'artifact') {
      this.buf = stripNestedArtifactOpensInArtifactBody(this.buf)
    }
    return this._drain()
  }

  /** Call when the stream ends to flush any remaining buffered text. */
  flush(): SidecarTextEvent[] {
    const out: SidecarTextEvent[] = []
    if (this.mode === 'artifact') {
      this.buf = stripNestedArtifactOpensInArtifactBody(this.buf)
    }
    if (this.buf.length > 0) {
      out.push({
        type: this.mode === 'artifact' ? 'artifact_delta' : 'text_delta',
        text: this.buf,
      })
    }
    if (this.mode === 'artifact') {
      out.push({ type: 'artifact_end' })
    }
    this.buf = ''
    this.mode = 'text'
    return out
  }

  reset(): void {
    this.buf = ''
    this.mode = 'text'
  }

  private _drain(): SidecarTextEvent[] {
    const out: SidecarTextEvent[] = []

    while (true) {
      const tag = this.mode === 'text' ? OPEN_TAG : CLOSE_TAG
      const idx = this.buf.indexOf(tag)

      if (idx === -1) {
        // Tag not found — emit all except a suffix that might be the start of `tag`
        // (e.g. `</arti` while streaming `</artifact>`). Never use a fixed (tag.length-1)
        // holdback in artifact mode or short body text gets truncated.
        const hold = tagPrefixHoldback(this.buf, tag)
        const safe = this.buf.length - hold
        if (safe > 0) {
          out.push({
            type: this.mode === 'artifact' ? 'artifact_delta' : 'text_delta',
            text: this.buf.slice(0, safe),
          })
          this.buf = this.buf.slice(safe)
        }
        break
      }

      // Found the tag
      if (idx > 0) {
        // Emit content before the tag
        out.push({
          type: this.mode === 'artifact' ? 'artifact_delta' : 'text_delta',
          text: this.buf.slice(0, idx),
        })
      }

      if (this.mode === 'text') {
        out.push({ type: 'artifact_start' })
        this.mode = 'artifact'
      } else {
        out.push({ type: 'artifact_end' })
        this.mode = 'text'
      }

      this.buf = this.buf.slice(idx + tag.length)
    }

    return out
  }
}
