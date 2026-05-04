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

export class ArtifactParser {
  private buf = ''
  private mode: 'text' | 'artifact' = 'text'

  /** Feed new text from a text_delta event. Returns derived events to emit. */
  feed(text: string): SidecarTextEvent[] {
    this.buf += text
    return this._drain()
  }

  /** Call when the stream ends to flush any remaining buffered text. */
  flush(): SidecarTextEvent[] {
    const out: SidecarTextEvent[] = []
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
        // Tag not found — emit everything except the last (tag.length - 1) chars
        // which could be a partial tag at the buffer boundary.
        const safe = this.buf.length - (tag.length - 1)
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
