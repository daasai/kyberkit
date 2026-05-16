import { TypedEventBus } from '../../../events/EventBus.js'
import type { KyberEvents } from '../../../types/events.js'
import type { Kevin2Events } from '../../../types/kevin2-events.js'
import { Kevin2TaskManager } from '../../TaskManager.js'

type AnyEvents = KyberEvents & Kevin2Events

/**
 * 为 kevin2/tasks 单测提供一个绑定到真实 EventBus 的最小 TaskManager。
 * 用法：const { manager, taskId } = createMockManager('first_encounter', { ... })
 */
export function createMockManager(
  taskType: Parameters<Kevin2TaskManager['enqueue']>[0],
  payload: Record<string, unknown>,
): { manager: Kevin2TaskManager; taskId: string; eventBus: TypedEventBus<AnyEvents> } {
  const eventBus = new TypedEventBus<AnyEvents>()
  const manager = new Kevin2TaskManager(eventBus)
  const taskId = manager.enqueue(taskType, payload)
  return { manager, taskId, eventBus }
}
