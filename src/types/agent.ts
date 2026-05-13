import { z } from 'zod';
import { Disposable } from './common.js';

/**
 * AgentStatus represents the state of an Agent instance.
 */
export type AgentStatus =
  | 'created'       // 实例已创建，尚未初始化
  | 'initializing'  // 正在加载配置、注册工具、建立模型连接
  | 'running'       // 正常执行任务
  | 'paused'        // 暂停执行（等待人工输入或资源释放）
  | 'completing'    // 任务声称完成，正在执行验证循环
  | 'completed'     // 验证通过，任务完成
  | 'failed'        // 不可恢复的异常
  | 'killed';       // 外部强制终止

export function isTerminalStatus(status: AgentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}

/**
 * AgentDefinition defines the static configuration of an Agent.
 */
export interface AgentDefinition {
  readonly name: string;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly initialContext?: any[];
}

/**
 * AgentInstance is the runtime handle for an active agent.
 */
export interface AgentInstance extends Disposable {
  readonly id: string;
  readonly status: AgentStatus;
  readonly definition: AgentDefinition;
  
  // State transitions (M6 implementation)
  transition(action: string): void;
}
