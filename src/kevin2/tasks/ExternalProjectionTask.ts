/**
 * ExternalProjectionTask — Phase 1 骨架
 *
 * 执行顺序（5 stages）：
 *   render_preview → create_action_request → waiting_signoff → write_to_feishu → write_audit
 *
 * Phase 1：auto-approve mock flow；Phase 2：接入真实 Rust IPC signoff pause。
 */

import type { Kevin2TaskManager } from '../TaskManager.js'

export interface ExternalProjectionPayload {
  taskId: string
  spaceId: string
  artifactId: string
  targetConnectorId: string
  targetDocTitle: string
}

export interface ExternalProjectionResult {
  actionRequestId: string
  externalUrl?: string
  status: 'approved' | 'rejected'
}

export async function runExternalProjectionTask(
  payload: ExternalProjectionPayload,
  manager: Kevin2TaskManager,
): Promise<ExternalProjectionResult> {
  const { taskId } = payload

  let t = Date.now()
  manager.reportStageStarted(taskId, 0, 'render_preview')
  await delay(200)
  manager.reportStageCompleted(taskId, 'render_preview', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 1, 'create_action_request')
  await delay(150)
  const mockActionRequestId = crypto.randomUUID()
  manager.reportStageCompleted(taskId, 'create_action_request', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 2, 'waiting_signoff')
  await delay(200)
  manager.reportStageCompleted(taskId, 'waiting_signoff', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 3, 'write_to_feishu')
  await delay(400)
  const mockExternalUrl = `https://internal.feishu.cn/docx/mock-${mockActionRequestId.slice(0, 8)}`
  manager.reportStageCompleted(taskId, 'write_to_feishu', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 4, 'write_audit')
  await delay(100)
  manager.reportStageCompleted(taskId, 'write_audit', Date.now() - t)

  return {
    actionRequestId: mockActionRequestId,
    externalUrl: mockExternalUrl,
    status: 'approved',
  }
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms))
}
