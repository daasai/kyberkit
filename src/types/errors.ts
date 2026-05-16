import { z } from 'zod';

/** 
 * ERROR_CATEGORIES define the high-level classification of KyberKit errors.
 */
export type ErrorCategory =
  | 'permission'      // 权限类异常
  | 'validation'      // 校验类异常
  | 'tool_execution'  // 工具执行异常
  | 'model'           // 模型调用异常
  | 'config'          // 配置异常
  | 'lifecycle'       // 生命周期异常
  | 'internal';       // 内部异常（应视为 Bug）

/**
 * KyberError is the unified base class for all KyberKit framework errors.
 */
export abstract class KyberError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp = Date.now();

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    // Capture stack trace for better debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ---- M1: Specific Error Types ----

/**
 * PermissionDeniedError triggered when a tool execution is blocked by the Sandbox.
 */
export class PermissionDeniedError extends KyberError {
  readonly code = 'PERMISSION_DENIED';
  readonly category = 'permission' as const;

  constructor(
    public readonly toolName: string,
    public readonly requiredTag: string,
    public readonly grant?: any, // Generic grant representation for now
  ) {
    super(`Tool "${toolName}" requires permission "${requiredTag}" which is denied.`);
  }
}

/**
 * ToolValidationError triggered when tool input or output schema validation fails.
 */
export interface ValidationError {
  path: (string | number)[];
  message: string;
  code: string;
}

export class ToolValidationError extends KyberError {
  readonly code = 'TOOL_VALIDATION_FAILED';
  readonly category = 'validation' as const;

  constructor(
    public readonly toolName: string,
    public readonly errors: ValidationError[],
  ) {
    super(`Input validation failed for tool "${toolName}": ${errors.map(e => e.message).join('; ')}`);
  }
}

/**
 * InvalidTransitionError triggered when an invalid state transition is requested.
 */
export class InvalidTransitionError extends KyberError {
  readonly code = 'INVALID_STATE_TRANSITION';
  readonly category = 'lifecycle' as const;

  constructor(
    public readonly from: string,
    public readonly action: string,
  ) {
    super(`Invalid transition: cannot perform "${action}" from state "${from}".`);
  }
}

/**
 * ToolExecutionError triggered when a tool executor fails at runtime.
 */
export class ToolExecutionError extends KyberError {
  readonly code = 'TOOL_EXECUTION_FAILED';
  readonly category = 'tool_execution' as const;

  constructor(
    public readonly toolName: string,
    message: string,
    public readonly is_retryable: boolean = false,
    cause?: Error,
  ) {
    super(`Tool "${toolName}" execution failed: ${message}`, cause);
  }
}

/**
 * ConfigError triggered when the configuration file is invalid or missing.
 */
export class ConfigError extends KyberError {
  readonly code = 'CONFIG_ERROR';
  readonly category = 'config' as const;
}

/**
 * ModelError triggered when the ModelProvider API fails.
 */
export class ModelError extends KyberError {
  readonly code = 'MODEL_ERROR';
  readonly category = 'model' as const;
}
