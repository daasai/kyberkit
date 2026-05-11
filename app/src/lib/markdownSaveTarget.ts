/** Whether a library ref path points to an editable Markdown file in the center canvas. */
export function isMarkdownLibraryRef(path: string | null | undefined): boolean {
  if (!path?.trim()) return false
  return /\.(md|markdown|mdx)$/i.test(path.trim())
}

/**
 * Full `@/libraries/...` ref to persist when the user clicks Save (library preview or saved artifact .md).
 */
export function markdownSaveTargetPath(artifact: {
  streaming: boolean
  libraryFileRef: string | null
  savedPath: string | null
}): string | null {
  if (artifact.streaming) return null
  if (artifact.libraryFileRef && isMarkdownLibraryRef(artifact.libraryFileRef)) {
    return artifact.libraryFileRef
  }
  if (artifact.savedPath && isMarkdownLibraryRef(artifact.savedPath)) {
    return artifact.savedPath
  }
  return null
}
