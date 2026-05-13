import { isAbsolute, resolve } from 'path';

/**
 * Sprint 3.5 §4.1 — Tool-call risk classification.
 *
 * L0: 只读 / 无副作用 — 永不询问
 * L1: 项目写 (工作区内、非 .kyberkit/) — 任务级一次确认
 * L2: 副作用 (不可逆 / 跨系统) — 任务级一次确认，独立勾选
 * L3: 危险 (sudo / 删除 .kyberkit / 跨用户写) — 每次确认
 */
export type PermissionLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface PermissionClassification {
  readonly level: PermissionLevel;
  readonly reason: string;
  /** Human-readable short tag used in batch auth cards, e.g. "写入 ./reports/foo.md". */
  readonly label: string;
  /** True when L3; consumers should require double-confirm. */
  readonly requiresSecondConfirm: boolean;
}

export interface PermissionPolicyOptions {
  /** Absolute path treated as the workspace root; default `process.cwd()`. */
  cwd?: string;
  /** Extra bash verbs user has allowed inline; case-insensitive. */
  extraBashAllowlist?: readonly string[];
}

/** Bash sub-commands that are unambiguously read-only. */
const BASH_READONLY_VERBS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'pwd',
  'echo',
  'which',
  'whoami',
  'date',
  'wc',
  'env',
  'file',
  'stat',
  'du',
  'df',
]);

/** Bash verbs that are always L2+ side-effects, regardless of args. */
const BASH_DESTRUCTIVE_VERBS = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'git',
  'npm',
  'bun',
  'yarn',
  'pnpm',
  'curl',
  'wget',
  'ssh',
  'scp',
  'rsync',
  'docker',
  'make',
]);

/** Bash verbs that are always L3 (privileged / cross-user). */
const BASH_PRIVILEGED_VERBS = new Set(['sudo', 'su', 'doas']);

/**
 * Classify a single tool call into an L0-L3 risk level.
 * Pure function — no I/O, safe to call per-invocation.
 */
export function classifyToolCall(
  toolName: string,
  input: unknown,
  opts: PermissionPolicyOptions = {},
): PermissionClassification {
  const cwd = opts.cwd ?? process.cwd();

  switch (toolName) {
    case 'read_file':
    case 'list_dir':
    case 'glob':
    case 'grep': {
      const p = extractPath(input);
      return {
        level: 'L0',
        reason: '只读文件操作',
        label: p ? `读取 ${shortenPath(p, cwd)}` : `${toolName}`,
        requiresSecondConfirm: false,
      };
    }

    case 'plan_task':
      return {
        level: 'L0',
        reason: '计划调度，无副作用',
        label: '规划步骤',
        requiresSecondConfirm: false,
      };

    case 'write_file':
    case 'edit_file': {
      const p = extractPath(input) ?? '';
      const kind = toolName === 'write_file' ? '写入' : '编辑';
      const clas = classifyWritePath(p, cwd);
      return {
        level: clas.level,
        reason: clas.reason,
        label: `${kind} ${shortenPath(p, cwd) || '(未知路径)'}`,
        requiresSecondConfirm: clas.level === 'L3',
      };
    }

    case 'delete_file': {
      const p = extractPath(input) ?? '';
      const clas = classifyWritePath(p, cwd);
      return {
        level: clas.level === 'L3' ? 'L3' : 'L2',
        reason: clas.level === 'L3' ? clas.reason : '删除文件（不可逆）',
        label: `删除 ${shortenPath(p, cwd) || '(未知路径)'}`,
        requiresSecondConfirm: clas.level === 'L3',
      };
    }

    case 'bash':
      return classifyBash(input, cwd, opts.extraBashAllowlist ?? []);

    case 'python':
      return classifyPython(input, cwd);

    default:
      // Unknown tools default to L1 (conservative: assume project-write scope).
      return {
        level: 'L1',
        reason: `未分类工具 ${toolName}`,
        label: toolName,
        requiresSecondConfirm: false,
      };
  }
}

function extractPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const p = (input as { path?: unknown }).path;
  return typeof p === 'string' ? p : null;
}

function shortenPath(p: string, cwd: string): string {
  if (!p) return '';
  const abs = isAbsolute(p) ? p : resolve(cwd, p);
  if (abs.startsWith(cwd + '/') || abs === cwd) {
    const rel = abs.slice(cwd.length).replace(/^\/+/, '');
    return rel.length > 0 ? `./${rel}` : './';
  }
  return p.length > 40 ? `…${p.slice(-39)}` : p;
}

function classifyWritePath(
  p: string,
  cwd: string,
): { level: PermissionLevel; reason: string } {
  if (!p) return { level: 'L1', reason: '未知路径，按项目写处理' };

  const abs = isAbsolute(p) ? p : resolve(cwd, p);
  const rel = abs.slice(cwd.length).replace(/^\/+/, '');

  // Outside workspace — L3 (cross-user or system-level)
  if (!abs.startsWith(cwd + '/') && abs !== cwd) {
    return { level: 'L3', reason: '跨工作区路径，需严格确认' };
  }

  // .kyberkit/ inside workspace — L3 (config / runtime state)
  if (rel.startsWith('.kyberkit/') || rel === '.kyberkit') {
    return { level: 'L3', reason: '写入 KyberKit 内部目录' };
  }

  return { level: 'L1', reason: '工作区内普通写入' };
}

function classifyBash(
  input: unknown,
  cwd: string,
  extraAllowlist: readonly string[],
): PermissionClassification {
  const cmd =
    input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string'
      ? ((input as { command: string }).command as string)
      : '';
  const trimmed = cmd.trim();
  const firstToken = trimmed.split(/\s+/)[0] ?? '';
  const verb = firstToken.split('/').pop() ?? firstToken;
  const lowerVerb = verb.toLowerCase();
  const allow = new Set(extraAllowlist.map((s) => s.toLowerCase()));

  if (BASH_PRIVILEGED_VERBS.has(lowerVerb)) {
    return {
      level: 'L3',
      reason: '特权命令（sudo/su）',
      label: `shell: ${truncate(trimmed, 60)}`,
      requiresSecondConfirm: true,
    };
  }

  // `git status` / `git log` / `git diff` are read-only; `git push` / `git commit` are not.
  if (lowerVerb === 'git') {
    const sub = (trimmed.split(/\s+/)[1] ?? '').toLowerCase();
    const readOnlySub = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'config']);
    if (readOnlySub.has(sub)) {
      return {
        level: 'L0',
        reason: 'git 只读子命令',
        label: `git ${sub}`,
        requiresSecondConfirm: false,
      };
    }
    return {
      level: 'L2',
      reason: 'git 写类子命令',
      label: `shell: ${truncate(trimmed, 60)}`,
      requiresSecondConfirm: false,
    };
  }

  if (BASH_DESTRUCTIVE_VERBS.has(lowerVerb)) {
    return {
      level: 'L2',
      reason: `shell ${verb} 带副作用`,
      label: `shell: ${truncate(trimmed, 60)}`,
      requiresSecondConfirm: false,
    };
  }

  if (BASH_READONLY_VERBS.has(lowerVerb) || allow.has(lowerVerb)) {
    return {
      level: 'L0',
      reason: '只读 shell 命令',
      label: `shell: ${truncate(trimmed, 60)}`,
      requiresSecondConfirm: false,
    };
  }

  // Redirection into workspace file → treat as L1 (project write).
  if (/[>][>]?\s*[^|&;]/.test(cmd)) {
    const clas = classifyWritePath(extractRedirectTarget(cmd) ?? '', cwd);
    return {
      level: clas.level === 'L3' ? 'L3' : 'L2',
      reason: '通过重定向写文件',
      label: `shell: ${truncate(trimmed, 60)}`,
      requiresSecondConfirm: clas.level === 'L3',
    };
  }

  // Unknown verbs default to L2 (conservative — shell is inherently effectful).
  return {
    level: 'L2',
    reason: '未知 shell 命令',
    label: `shell: ${truncate(trimmed, 60)}`,
    requiresSecondConfirm: false,
  };
}

function extractRedirectTarget(cmd: string): string | null {
  const m = cmd.match(/>>?\s*([^\s|&;]+)/);
  return m ? m[1] ?? null : null;
}

function classifyPython(input: unknown, _cwd: string): PermissionClassification {
  if (!input || typeof input !== 'object') {
    return { level: 'L1', reason: 'Python 执行（默认项目写）', label: 'python', requiresSecondConfirm: false };
  }
  const mode = (input as { mode?: string }).mode;
  if (mode === 'inline') {
    return {
      level: 'L1',
      reason: '内联 Python 代码执行',
      label: 'python 内联',
      requiresSecondConfirm: false,
    };
  }
  if (mode === 'file') {
    const p = typeof (input as { path?: unknown }).path === 'string' ? (input as { path: string }).path : '';
    return {
      level: 'L1',
      reason: '执行工作区 Python 脚本',
      label: `python ${p}`,
      requiresSecondConfirm: false,
    };
  }
  return { level: 'L1', reason: 'Python 执行', label: 'python', requiresSecondConfirm: false };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
