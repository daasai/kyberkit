/**
 * Extract plain text from PDF / Excel / Word for Kevin library preview and read_file.
 */
import { readFile } from 'fs/promises'
import * as path from 'path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

const EXTRACTABLE = new Set(['.pdf', '.xlsx', '.xls', '.docx', '.doc'])

export function isBinaryExtractablePath(filePath: string): boolean {
  return EXTRACTABLE.has(path.extname(filePath).toLowerCase())
}

/**
 * Returns UTF-8 text or null if unsupported / parse failure.
 */
export async function extractTextFromBinaryFile(absPath: string): Promise<string | null> {
  const ext = path.extname(absPath).toLowerCase()
  if (!EXTRACTABLE.has(ext)) return null

  let buf: Buffer
  try {
    buf = await readFile(absPath)
  } catch {
    return null
  }

  try {
    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buf })
      try {
        const result = await parser.getText()
        const text = typeof result?.text === 'string' ? result.text.trim() : ''
        return text.length > 0 ? text : null
      } finally {
        await parser.destroy().catch(() => undefined)
      }
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.read(buf, { type: 'buffer' })
      const parts: string[] = []
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name]
        if (!sheet) continue
        const csv = XLSX.utils.sheet_to_csv(sheet)
        parts.push(`## ${name}\n${csv}`)
      }
      const out = parts.join('\n\n').trim()
      return out.length > 0 ? out : null
    }

    if (ext === '.docx' || ext === '.doc') {
      const r = await mammoth.extractRawText({ buffer: buf })
      const text = (r.value ?? '').trim()
      return text.length > 0 ? text : null
    }
  } catch {
    return null
  }

  return null
}
