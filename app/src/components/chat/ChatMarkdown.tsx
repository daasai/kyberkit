/**
 * Renders assistant chat content as GitHub-flavored Markdown (tables, lists, etc.).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const onSurface = 'var(--color-on-surface)'
const onVariant = 'var(--color-on-surface-variant)'
const outline = 'var(--color-outline-variant)'
const surfaceLow = 'var(--color-surface-container-lowest)'
const surfaceMid = 'var(--color-surface-container)'
const primary = 'var(--color-primary)'

const chatComponents: Components = {
  p: ({ children }) => (
    <p style={{ margin: '0 0 0.55em', lineHeight: 1.6, color: onSurface }}>{children}</p>
  ),
  h1: ({ children }) => (
    <h1 style={{ fontSize: '1.35em', fontWeight: 700, margin: '0.75em 0 0.4em', color: onSurface, lineHeight: 1.3 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0.65em 0 0.35em', color: onSurface, lineHeight: 1.35 }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: '1.08em', fontWeight: 600, margin: '0.55em 0 0.3em', color: onSurface, lineHeight: 1.4 }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontSize: '1.02em', fontWeight: 600, margin: '0.5em 0 0.25em', color: onSurface }}>{children}</h4>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: '0.35em 0 0.55em', paddingLeft: '1.35em', color: onSurface, lineHeight: 1.55 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '0.35em 0 0.55em', paddingLeft: '1.35em', color: onSurface, lineHeight: 1.55 }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: '0.12em 0' }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: onSurface }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: 'italic', color: onSurface }}>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '0.5em 0',
        padding: '6px 12px',
        borderLeft: '3px solid color-mix(in srgb, var(--color-primary) 55%, var(--color-outline-variant))',
        background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
        color: onVariant,
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: `1px solid ${outline}`, margin: '0.75em 0' }} />
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      style={{ color: primary, textDecoration: 'underline', textUnderlineOffset: '2px' }}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...rest }) => {
    const inline = 'inline' in rest && Boolean((rest as { inline?: boolean }).inline)
    if (inline) {
      return (
        <code
          style={{
            fontSize: '0.9em',
            background: surfaceMid,
            padding: '0.12em 0.4em',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
            color: onSurface,
          }}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className={className}
        style={{
          display: 'block',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          fontSize: '12px',
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          color: onSurface,
        }}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: '0.5em 0',
        padding: '10px 12px',
        borderRadius: '8px',
        background: surfaceLow,
        border: `1px solid ${outline}`,
        overflow: 'auto',
        maxWidth: '100%',
      }}
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0.5em 0', maxWidth: '100%' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          color: onSurface,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th
      style={{
        border: `1px solid ${outline}`,
        padding: '6px 8px',
        background: surfaceMid,
        fontWeight: 600,
        textAlign: 'left',
        verticalAlign: 'top',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        border: `1px solid ${outline}`,
        padding: '6px 8px',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  ),
}

export function ChatMarkdown({ content }: { content: string }) {
  const trimmed = content.trim()
  if (!trimmed) return null
  return (
    <div style={{ wordBreak: 'break-word', color: onSurface }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatComponents}>
        {trimmed}
      </ReactMarkdown>
    </div>
  )
}
