/**
 * PermissionTag defines the granular actions that can be controlled by the sandbox.
 */
export type PermissionTag =
  | 'read_fs'      // 文件系统读
  | 'write_fs'     // 文件系统写
  | 'read_net'     // 网络读
  | 'write_net'    // 网络写
  | 'exec_code'    // 代码执行
  | 'exec_shell'   // Shell 执行
  | 'read_env'     // 环境变量读
  | 'write_env'    // 环境变量写
  | 'read_memory'  // 记忆系统读
  | 'write_memory'; // 记忆系统写

/**
 * PermissionResult represents the outcome of a permission check.
 */
export interface PermissionResult {
  readonly behavior: 'allow' | 'deny' | 'ask';
  readonly reason?: string;
}

/**
 * PermissionGrant defines the explicit permissions awarded to an Agent.
 */
export interface PermissionGrant {
  /** 允许的权限标签集 */
  readonly allowed: Set<PermissionTag>;
  /** 拒绝的权限标签集 (优先级高于 allowed) */
  readonly denied: Set<PermissionTag>;
  /** 文件系统访问的白名单路径 */
  readonly allowedPaths?: string[];
  /** 网络访问的白名单域名 */
  readonly allowedDomains?: string[];
}
