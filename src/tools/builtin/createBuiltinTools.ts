import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { PermissionSandbox } from '../../permission/PermissionSandbox.js';
import type { PermissionTag } from '../../types/permission.js';
import type { ToolDefinition } from '../../types/tool.js';
import type { ShellExecutor } from '../../types/tool.js';
import { randomUUID } from 'crypto';
import { buildTool } from '../buildTool.js';
import { matchSimpleGlob } from './globMatch.js';
import { readFileSafe, resolveSandboxedPath, writeFileSafe } from './pathSafe.js';

function perm(
  sandbox: PermissionSandbox,
  tags: PermissionTag[],
): { behavior: 'allow' | 'deny'; reason?: string } {
  const r = sandbox.checkAll(tags);
  return r.allowed ? { behavior: 'allow' } : { behavior: 'deny', reason: r.reason ?? 'denied' };
}

async function walkFiles(dir: string, out: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      await walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
}

/**
 * Create all Phase-A builtin atomic tools (CCR-aligned: Read / Write / Edit / Glob / Grep / Bash / Python).
 * @param workspaceCwd — default cwd for relative paths (Kevin Rev3: Library mount, not process.cwd()).
 */
export function createBuiltinTools(
  shell: ShellExecutor,
  sandbox: PermissionSandbox,
  workspaceCwd: string = process.cwd(),
): ToolDefinition[] {
  const listAllowedDirectories = buildTool({
    name: 'list_allowed_directories',
    descriptionText: 'List directories that the agent is allowed to access (sandbox roots).',
    inputSchema: z.object({}),
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async () => ({ behavior: 'allow' as const }),
    call: async () => {
      const roots = sandbox.listAllowedPaths();
      const shown = roots.length > 0 ? roots : [workspaceCwd];
      return { success: true, output: shown.join('\n') };
    },
  });

  const listDirectory = buildTool({
    name: 'list_directory',
    descriptionText:
      'List files and directories under a path (default: cwd). Use for quick folder inspection.',
    inputSchema: z.object({
      path: z.string().optional().describe('Directory to list (default: .)'),
      max: z.number().optional().describe('Max entries to return (default: 200)'),
    }),
    maxResultSizeChars: 100_000,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs']),
    call: async (input) => {
      const max = Math.max(1, Math.min(500, input.max ?? 200));
      const abs = resolveSandboxedPath(input.path ?? '.', workspaceCwd, sandbox);
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(abs, { withFileTypes: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to read directory';
        return { success: false, error: msg };
      }
      const rows = entries
        .slice(0, max)
        .map((e) => `${e.isDirectory() ? 'dir ' : 'file'} ${e.name}`)
        .join('\n');
      const extra = entries.length > max ? `\n... and ${entries.length - max} more` : '';
      return { success: true, output: rows + extra || '(empty)' };
    },
  });
  const readFile = buildTool({
    name: 'read_file',
    descriptionText:
      'Read a text file from the workspace. Use offset/limit for large files. Returns UTF-8 text (truncated if too long).',
    inputSchema: z.object({
      path: z.string().describe('Path relative to cwd or absolute within allowed roots'),
      offset: z.number().optional().describe('Line offset (0-based)'),
      limit: z.number().optional().describe('Max lines to return'),
    }),
    maxResultSizeChars: 200_000,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    searchHint: 'read file open cat head',
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs']),
    call: async (input, _ctx) => {
      const abs = resolveSandboxedPath(input.path, workspaceCwd, sandbox);
      let text = await readFileSafe(abs, 500_000);
      if (input.offset !== undefined || input.limit !== undefined) {
        const lines = text.split('\n');
        const start = input.offset ?? 0;
        const end = input.limit !== undefined ? start + input.limit : lines.length;
        text = lines.slice(start, end).join('\n');
      }
      return { success: true, output: text };
    },
  });

  const writeFile = buildTool({
    name: 'write_file',
    descriptionText: 'Create or overwrite a file with the given UTF-8 content. Creates parent directories as needed.',
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
    }),
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDestructive: () => false,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs', 'write_fs']),
    call: async (input, _ctx) => {
      const abs = resolveSandboxedPath(input.path, workspaceCwd, sandbox);
      await writeFileSafe(abs, input.content);
      return { success: true, output: `Wrote ${input.content.length} characters to ${input.path}` };
    },
  });

  const editFile = buildTool({
    name: 'edit_file',
    descriptionText:
      'Replace one occurrence of old_string with new_string in a text file. Fails if old_string is not found or appears more than once (be precise).',
    inputSchema: z.object({
      path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
    isConcurrencySafe: () => false,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs', 'write_fs']),
    call: async (input, _ctx) => {
      const abs = resolveSandboxedPath(input.path, workspaceCwd, sandbox);
      const before = await readFileSafe(abs, 500_000);
      const count = before.split(input.old_string).length - 1;
      if (count === 0) {
        return { success: false, error: 'old_string not found' };
      }
      if (count > 1) {
        return { success: false, error: `old_string matched ${count} times; make it unique` };
      }
      const after = before.replace(input.old_string, input.new_string);
      await writeFileSafe(abs, after);
      return { success: true, output: `Updated ${input.path}` };
    },
  });

  const globTool = buildTool({
    name: 'glob',
    descriptionText:
      'List files under cwd matching a glob pattern (e.g. **/*.csv, src/**/*.ts). Respects .gitignore-style skips for node_modules and .git.',
    inputSchema: z.object({
      pattern: z.string(),
      cwd: z.string().optional().describe('Directory to search (default: workspace cwd)'),
    }),
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs']),
    call: async (input, _ctx) => {
      const root = resolveSandboxedPath(input.cwd ?? '.', workspaceCwd, sandbox);
      const files: string[] = [];
      await walkFiles(root, files);
      const relFiles = files
        .map((f) => path.relative(root, f).replace(/\\/g, '/'))
        .filter((rel) => matchSimpleGlob(rel, input.pattern));
      const lines = relFiles.slice(0, 500).join('\n');
      const extra = relFiles.length > 500 ? `\n... and ${relFiles.length - 500} more` : '';
      return { success: true, output: lines + extra || '(no matches)' };
    },
  });

  const grepTool = buildTool({
    name: 'grep',
    descriptionText:
      'Search file contents for a regex pattern under a directory. Returns matching lines with file:line (max 200 hits).',
    inputSchema: z.object({
      pattern: z.string().describe('ECMAScript regex'),
      path: z.string().optional().describe('File or directory to search (default: .)'),
      glob: z.string().optional().describe('Optional glob filter for files, e.g. *.csv'),
    }),
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['read_fs']),
    call: async (input, _ctx) => {
      const base = resolveSandboxedPath(input.path ?? '.', workspaceCwd, sandbox);
      const stat = await fs.stat(base).catch(() => null);
      const hits: string[] = [];
      const max = 200;

      async function scanFile(file: string) {
        if (hits.length >= max) return;
        const rel = path.relative(workspaceCwd, file);
        const text = await readFileSafe(file, 200_000);
        const lines = text.split('\n');
        let lineRe: RegExp;
        try {
          lineRe = new RegExp(input.pattern);
        } catch {
          lineRe = /$^/;
        }
        lines.forEach((line, i) => {
          if (hits.length >= max) return;
          if (lineRe.test(line)) hits.push(`${rel}:${i + 1}:${line}`);
        });
      }

      if (stat?.isFile()) {
        await scanFile(base);
      } else if (stat?.isDirectory()) {
        const files: string[] = [];
        await walkFiles(base, files);
        const filtered = input.glob
          ? files.filter((f) => {
              const rel = path.relative(base, f).replace(/\\/g, '/');
              return matchSimpleGlob(rel, input.glob) || matchSimpleGlob(path.basename(f), input.glob);
            })
          : files;
        for (const f of filtered) {
          await scanFile(f);
          if (hits.length >= max) break;
        }
      } else {
        return { success: false, error: 'path not found' };
      }

      return { success: true, output: hits.join('\n') || '(no matches)' };
    },
  });

  const bashTool = buildTool({
    name: 'bash',
    descriptionText:
      'Run a shell command via sh -c. Prefer read_file/glob/grep for I/O. Use for piped commands, package scripts, or when other tools are insufficient.',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      timeout_ms: z.number().optional(),
    }),
    maxResultSizeChars: 100_000,
    /** Parallel-safe so sibling-abort can cancel peer bash calls in one model turn. */
    isConcurrencySafe: () => true,
    interruptBehavior: 'cancel',
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['exec_shell']),
    call: async (input, ctx) => {
      const cwd = input.cwd ? resolveSandboxedPath(input.cwd, workspaceCwd, sandbox) : workspaceCwd;
      const result = await shell.exec(input.command, {
        cwd,
        timeoutMs: input.timeout_ms ?? 120_000,
        maxResultSizeChars: 100_000,
        signal: ctx.batchAbortSignal,
      });
      const out = [
        result.stdout,
        result.stderr ? `stderr:\n${result.stderr}` : '',
        `exit_code: ${result.exitCode}`,
        result.interrupted ? '(interrupted)' : '',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        success: result.exitCode === 0 && !result.interrupted,
        output: out,
      };
    },
  });

  const planTask = buildTool({
    name: 'plan_task',
    descriptionText:
      'Declare 3–6 short step titles for the current user task before heavy tool use. Call once at the start of multi-step work; call again with a new `steps` array to replace the plan.',
    inputSchema: z.object({
      steps: z.array(z.string()).min(1).max(12),
    }),
    maxResultSizeChars: 2_000,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    searchHint: 'plan todo steps mission checklist',
    checkPermissions: async () => ({ behavior: 'allow' as const }),
    call: async (input) => ({
      success: true,
      output: JSON.stringify({ ok: true, stepCount: input.steps.length }),
    }),
  });

  const pythonTool = buildTool({
    name: 'python',
    descriptionText:
      'Run Python 3 code (pandas/numpy friendly). Pass inline code OR a path to a .py file relative to cwd. For CSV analysis prefer pandas.read_csv.',
    inputSchema: z.discriminatedUnion('mode', [
      z.object({
        mode: z.literal('inline'),
        code: z.string(),
        cwd: z.string().optional(),
      }),
      z.object({
        mode: z.literal('file'),
        path: z.string(),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
      }),
    ]),
    isConcurrencySafe: () => false,
    checkPermissions: async (_input, _ctx) => perm(sandbox, ['exec_shell', 'read_fs']),
    call: async (input, ctx) => {
      const cwd = input.cwd ? resolveSandboxedPath(input.cwd, workspaceCwd, sandbox) : workspaceCwd;
      if (input.mode === 'inline') {
        const tmp = path.join(cwd, `.kyber-inline-${randomUUID()}.py`);
        await writeFileSafe(tmp, input.code);
        try {
          const result = await shell.exec(`python3 ${JSON.stringify(tmp)}`, {
            cwd,
            timeoutMs: 120_000,
            maxResultSizeChars: 100_000,
            signal: ctx.batchAbortSignal,
          });
          return {
            success: result.exitCode === 0,
            output: [result.stdout, result.stderr].filter(Boolean).join('\n') || `(exit ${result.exitCode})`,
          };
        } finally {
          await fs.unlink(tmp).catch(() => {});
        }
      }
      const script = resolveSandboxedPath(input.path, workspaceCwd, sandbox);
      const args = (input.args ?? []).map((a) => JSON.stringify(a)).join(' ');
      const cmd =
        args.length > 0
          ? `python3 ${JSON.stringify(script)} ${args}`
          : `python3 ${JSON.stringify(script)}`;
      const result = await shell.exec(cmd, {
        cwd,
        timeoutMs: 120_000,
        maxResultSizeChars: 100_000,
        signal: ctx.batchAbortSignal,
      });
      return {
        success: result.exitCode === 0,
        output: [result.stdout, result.stderr].filter(Boolean).join('\n') || `(exit ${result.exitCode})`,
      };
    },
  });

  return [
    // Compat aliases (Kevin UI prompts commonly call these)
    listAllowedDirectories,
    listDirectory,
    // Core builtins
    readFile,
    writeFile,
    editFile,
    globTool,
    grepTool,
    bashTool,
    pythonTool,
    planTask,
  ];
}
