/**
 * Physical Skill tier moves — Kevin v1.5 skill-architecture.md (promote / copy).
 */

import { cp, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join, normalize, resolve } from 'path'
import {
  spaceSkillsDir,
  userSkillsDir,
} from '../src/runtime/paths/PathResolver.js'

const SKILL_FOLDER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function assertSkillFolderName(name: string): string {
  const n = name.trim()
  if (!SKILL_FOLDER_RE.test(n)) {
    throw new Error('Invalid skill_folder: expected kebab-case slug')
  }
  return n
}

function resolveInside(root: string, child: string): string {
  const absRoot = resolve(root)
  const absPath = resolve(join(absRoot, normalize(child)))
  if (absPath !== absRoot && !absPath.startsWith(`${absRoot}/`)) {
    throw new Error('Path traversal rejected')
  }
  return absPath
}

export async function promoteSpaceSkillToUser(
  spaceId: string,
  skillFolderName: string,
  userId = 'default',
): Promise<void> {
  const safe = assertSkillFolderName(skillFolderName)
  const from = resolveInside(spaceSkillsDir(spaceId), safe)
  const to = resolveInside(userSkillsDir(userId), safe)
  if (!existsSync(from)) throw new Error(`Skill folder not found: ${from}`)
  if (existsSync(to)) throw new Error(`Target skill already exists: ${to}`)
  await rename(from, to)
}

export async function copyUserSkillToSpace(
  skillFolderName: string,
  spaceId: string,
  userId = 'default',
): Promise<void> {
  const safe = assertSkillFolderName(skillFolderName)
  const from = resolveInside(userSkillsDir(userId), safe)
  const to = resolveInside(spaceSkillsDir(spaceId), safe)
  if (!existsSync(from)) throw new Error(`User skill not found: ${from}`)
  if (existsSync(to)) throw new Error(`Space skill already exists: ${to}`)
  await cp(from, to, { recursive: true })
}
