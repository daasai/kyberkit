import * as fs from 'fs/promises';
import * as path from 'path';
import type { PermissionSandbox } from '../../permission/PermissionSandbox.js';

/**
 * Resolve a user-supplied path against cwd and verify it stays within sandbox allowed paths.
 */
export function resolveSandboxedPath(userPath: string, cwd: string, sandbox: PermissionSandbox): string {
  const resolved = path.resolve(cwd, userPath);
  if (!sandbox.checkPath(resolved)) {
    throw new Error(`Path not allowed by sandbox: ${userPath}`);
  }
  return resolved;
}

export async function readFileSafe(absPath: string, maxChars: number): Promise<string> {
  const stat = await fs.stat(absPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${absPath}`);
  }
  const raw = await fs.readFile(absPath, 'utf-8');
  if (raw.length > maxChars) {
    return raw.slice(0, maxChars) + '\n... [truncated]';
  }
  return raw;
}

export async function writeFileSafe(absPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
}
