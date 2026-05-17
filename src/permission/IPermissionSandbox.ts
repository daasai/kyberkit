import type { PermissionTag } from '../types/permission.js'

/**
 * Minimal interface for sandbox-style permission checking.
 * Implemented by PermissionSandbox; used as a structural type in actuators
 * to avoid coupling to the full class.
 */
export interface IPermissionSandbox {
  check(required: PermissionTag): { allowed: boolean; reason?: string }
  checkAll(required: PermissionTag[]): { allowed: boolean; reason?: string }
}
