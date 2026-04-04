import { z } from 'zod';
import { PermissionResult } from './permission.js';

/**
 * Options for shell command execution.
 */
export interface ShellOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Working directory */
  cwd?: string;
  /** Whether to enable sandbox (Phase 0.5+) */
  sandbox?: boolean;
  /** Maximum result size in characters */
  maxResultSizeChars?: number;
}

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  interrupted: boolean;
}

/**
 * Interface for the Shell Executor component.
 */
export interface ShellExecutor {
  /** Execute a shell command */
  exec(command: string, options: ShellOptions): Promise<ShellResult>;
  /** Execute a command in the background */
  execBackground(command: string, options: ShellOptions): Promise<any>;
  /** Check if a command is read-only */
  isReadOnly(command: string): boolean;
  /** Check if a command is destructive */
  isDestructive(command: string): boolean;
}

/**
 * Registry for MCP Server tools.
 */
export interface MCPToolRegistry {
  findTool(name: string): ToolDefinition | undefined;
  listTools(): ToolDefinition[];
}

/**
 * Registry for KyberKit skills.
 */
export interface SkillRegistry {
  findSkill(name: string): ToolDefinition | undefined;
  listSkills(): ToolDefinition[];
}

/**
 * Facade providing a unified interface to all tool sources.
 */
export interface ToolIntegrationFacade {
  findTool(query: string): ToolDefinition | undefined;
  listAll(): ToolDefinition[];
}


/**
 * ValidationResult represents the output of input/output schema validation.
 */
export interface ValidationResult {
  readonly result: boolean;
  readonly errors?: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * ToolResult represents the outcome of a tool call.
 */
export interface ToolResult<T = unknown> {
  readonly success: boolean;
  readonly output?: T;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Context provided to tools during execution.
 */
export interface ToolContext {
  readonly agentId: string;
  readonly traceId: string;
}

/**
 * Specialized context for a specific tool use.
 */
export interface ToolUseContext extends ToolContext {
  readonly callId: string;
}

/**
 * Base interface for all tools in KyberKit.
 */
export interface ToolDefinition<Input = unknown, Output = unknown> {
  /** 工具唯一标识 */
  readonly name: string;
  /** 向后兼容别名 */
  readonly aliases?: string[];
  /** 结构化输入 Schema (Zod) */
  readonly inputSchema: z.ZodType<Input>;
  /** 结构化输出 Schema (Zod) */
  readonly outputSchema?: z.ZodType<Output>;
  
  /** 机器可读的语义描述 */
  description(input: Input, context: ToolContext): Promise<string>;
  
  /** 工具执行逻辑 */
  call(input: Input, context: ToolUseContext): Promise<ToolResult<Output>>;
  
  /** 并发安全标记 */
  isConcurrencySafe(input: Input): boolean;
  /** 只读操作标记 */
  isReadOnly(input: Input): boolean;
  /** 破坏性操作标记 */
  isDestructive?(input: Input): boolean;
  /** 工具启用/禁用状态 */
  isEnabled(): boolean;
  
  /** 输入校验 */
  validateInput?(input: Input, context: ToolUseContext): Promise<ValidationResult>;
  
  /** 权限检查 */
  checkPermissions(input: Input, context: ToolUseContext): Promise<PermissionResult>;
  
  /** 工具调用超时 (ms) */
  readonly timeoutMs?: number;
  /** 结果大小上限 (chars) */
  readonly maxResultSizeChars: number;
}
