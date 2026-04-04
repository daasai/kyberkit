import * as path from 'path';
import { PermissionGrant, PermissionTag, PermissionResult } from '../types/permission.js';

export class PermissionSandbox {
  constructor(private readonly grant: PermissionGrant) {}

  /**
   * Check if a specific permission tag is allowed.
   * Priority: Denied > Allowed > Default Deny
   */
  check(required: PermissionTag): { allowed: boolean; reason?: 'explicitly_denied' | 'not_granted' } {
    if (this.grant.denied.has(required)) {
      return { allowed: false, reason: 'explicitly_denied' };
    }
    if (this.grant.allowed.has(required)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'not_granted' };
  }

  /**
   * Check all required permission tags.
   */
  checkAll(required: PermissionTag[]): { allowed: boolean; reason?: string } {
    for (const tag of required) {
      const result = this.check(tag);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  /**
   * Check if a given file path is within the allowed paths whitelist.
   */
  checkPath(filePath: string): boolean {
    if (!this.grant.allowedPaths || this.grant.allowedPaths.length === 0) {
      return true; // No restrictions if empty
    }

    // Resolve and normalize the path to prevent .. traversal
    const normalizedTarget = path.resolve(filePath);

    return this.grant.allowedPaths.some(p => {
      const normalizedAllowed = path.resolve(p);
      // Ensure the target is inside the allowed path and not escaping
      return normalizedTarget.startsWith(normalizedAllowed);
    });
  }

  /**
   * Create a restricted sub-sandbox derived from this one.
   * Permissions can only be narrowed, never expanded.
   */
  fork(restriction: Partial<PermissionGrant>): PermissionSandbox {
    const newAllowed = new Set<PermissionTag>();
    for (const tag of (restriction.allowed ?? this.grant.allowed)) {
      // Intersection: target must be allowed in BOTH parent and sibling
      if (this.grant.allowed.has(tag)) {
        newAllowed.add(tag);
      }
    }

    const newDenied = new Set<PermissionTag>(this.grant.denied);
    if (restriction.denied) {
      for (const tag of restriction.denied) {
        newDenied.add(tag);
      }
    }

    // Narrow allowed paths
    let newPaths = this.grant.allowedPaths;
    if (restriction.allowedPaths) {
      if (!newPaths) {
        newPaths = restriction.allowedPaths;
      } else {
        // Only keep paths that are subpaths of existing allowed paths
        newPaths = restriction.allowedPaths.filter(p => this.checkPath(p));
      }
    }

    return new PermissionSandbox({
      allowed: newAllowed,
      denied: newDenied,
      allowedPaths: newPaths,
      allowedDomains: restriction.allowedDomains ?? this.grant.allowedDomains
    });
  }
}
