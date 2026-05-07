/**
 * Sensor 凭证池 — 密文落盘于 users/<id>/credentials/（PRD §8.2.2）— 接口骨架。
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { userCredentialsDir } from '../paths/PathResolver.js'

export function credentialFilePath(
  userId: string,
  sensorId: string,
  scheme: string,
): string {
  return join(userCredentialsDir(userId), `${sensorId}.${scheme}.enc`)
}

/** 写入占位密文；生产应使用 KMS / OS 钥匙串封装。 */
export function writeCredentialPlaceholder(
  userId: string,
  sensorId: string,
  scheme: string,
  _payload: Uint8Array,
): string {
  const p = credentialFilePath(userId, sensorId, scheme)
  mkdirSync(userCredentialsDir(userId), { recursive: true })
  if (!existsSync(p)) {
    writeFileSync(p, Buffer.from('placeholder-encrypted-blob'), { mode: 0o600 })
  }
  return p
}
