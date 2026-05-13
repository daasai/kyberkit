/**
 * Encrypted user-tier config at ~/.kyberkit/users/default/config.enc
 * AES-256-GCM with key derived from salt file (see tier-architecture.md).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { userConfigPath, userRoot } from '../paths/PathResolver.js'

export interface UserTierConfigPayload {
  anthropicApiKey?: string
  modelName?: string
  baseUrl?: string
}

const VERSION = 1

function saltPath(userId: string): string {
  return join(userRoot(userId), '.config-salt')
}

function deriveKey(userId: string): Buffer {
  const sp = saltPath(userId)
  let salt: Buffer
  if (existsSync(sp)) {
    salt = readFileSync(sp)
  } else {
    mkdirSync(userRoot(userId), { recursive: true })
    salt = randomBytes(16)
    writeFileSync(sp, salt)
  }
  return scryptSync('kyberkit-v15-user-config', salt, 32)
}

function encryptJson(userId: string, obj: UserTierConfigPayload | Record<string, unknown>): string {
  const key = deriveKey(userId)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = Buffer.from(
    JSON.stringify({ v: VERSION, ...(obj as Record<string, unknown>) }),
    'utf-8',
  )
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, enc]).toString('base64')
}

function decryptJson(userId: string, b64: string): Record<string, unknown> | null {
  try {
    const raw = Buffer.from(b64, 'base64')
    if (raw[0] !== VERSION) return null
    const iv = raw.subarray(1, 13)
    const tag = raw.subarray(13, 29)
    const enc = raw.subarray(29)
    const key = deriveKey(userId)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()])
    return JSON.parse(dec.toString('utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function loadUserConfig(userId: string = 'default'): UserTierConfigPayload {
  const path = userConfigPath(userId)
  if (!existsSync(path)) return {}
  try {
    const b64 = readFileSync(path, 'utf-8').trim()
    const data = decryptJson(userId, b64)
    if (!data) return {}
    const { v: _v, ...rest } = data
    return {
      anthropicApiKey: typeof rest.anthropicApiKey === 'string' ? rest.anthropicApiKey : undefined,
      modelName: typeof rest.modelName === 'string' ? rest.modelName : undefined,
      baseUrl: typeof rest.baseUrl === 'string' ? rest.baseUrl : undefined,
    }
  } catch {
    return {}
  }
}

export function saveUserConfig(userId: string, payload: UserTierConfigPayload): void {
  mkdirSync(userRoot(userId), { recursive: true })
  const path = userConfigPath(userId)
  const b64 = encryptJson(userId, payload)
  writeFileSync(path, b64, 'utf-8')
}

/**
 * Applies user-tier config to process.env so KyberRuntime loadConfig() picks it up.
 * Precedence: user file overrides empty env; existing non-empty env wins (dev .env).
 */
export function applyUserConfigToEnv(userId: string = 'default'): void {
  const cfg = loadUserConfig(userId)
  if (cfg.anthropicApiKey && !process.env.ANTHROPIC_API_KEY?.trim()) {
    process.env.ANTHROPIC_API_KEY = cfg.anthropicApiKey
  }
  if (cfg.modelName && !process.env.KYBER_MODEL_NAME?.trim()) {
    process.env.KYBER_MODEL_NAME = cfg.modelName
  }
  if (cfg.baseUrl !== undefined && cfg.baseUrl !== '' && !process.env.KYBER_MODEL_BASE_URL?.trim()) {
    process.env.KYBER_MODEL_BASE_URL = cfg.baseUrl
  }
}

/** Force apply even when env is set (after GUI save). */
export function forceApplyUserConfigToEnv(userId: string = 'default'): void {
  const cfg = loadUserConfig(userId)
  if (cfg.anthropicApiKey) process.env.ANTHROPIC_API_KEY = cfg.anthropicApiKey
  if (cfg.modelName) process.env.KYBER_MODEL_NAME = cfg.modelName
  if (cfg.baseUrl !== undefined) process.env.KYBER_MODEL_BASE_URL = cfg.baseUrl || ''
}

/**
 * Bootstrap: if no config.enc but ANTHROPIC_API_KEY exists in env, persist encrypted copy once.
 */
export function bootstrapPersistEnvIfMissing(userId: string = 'default'): void {
  const path = userConfigPath(userId)
  if (existsSync(path)) return
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return
  saveUserConfig(userId, {
    anthropicApiKey: key,
    modelName: process.env.KYBER_MODEL_NAME?.trim(),
    baseUrl: process.env.KYBER_MODEL_BASE_URL?.trim(),
  })
}
