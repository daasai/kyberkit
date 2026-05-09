import { useCallback, useEffect, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../config/sidecarUrl'

export type SkillScope = 'global' | 'user' | 'space'
export type SkillRisk = 'low' | 'medium' | 'high'

export interface SkillDirectoryEntry {
  name: string
  description: string
  scope: SkillScope
  risk: SkillRisk
  allowedTools: string[]
  triggers: string[]
}

/**
 * Kevin v1.5 §12.5 — L1 Skill directory consumed by the right-panel `/` slash menu
 * and the Skill Store "我的 Skills" tab. Re-fetches whenever the active Space changes.
 */
export function useSkillDirectory(spaceId: string | null): {
  skills: SkillDirectoryEntry[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [skills, setSkills] = useState<SkillDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!spaceId) {
      setSkills([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SIDECAR_URL}/skills${qsSpace(spaceId)}`)
      if (!res.ok) {
        throw new Error(`Failed to load skills: ${res.status}`)
      }
      const list = (await res.json()) as SkillDirectoryEntry[]
      setSkills(Array.isArray(list) ? list : [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setSkills([])
    } finally {
      setIsLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { skills, isLoading, error, refresh }
}

/**
 * Filter the L1 directory by a slash query.
 * Empty query returns the full list.
 */
export function filterSkillsByQuery(
  skills: SkillDirectoryEntry[],
  query: string,
): SkillDirectoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  )
}
