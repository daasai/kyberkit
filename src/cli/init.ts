import { mkdir, writeFile, appendFile } from 'fs/promises';
import { readdirSync } from 'fs';
import { join } from 'path';
import { ensureWorkspaceSeed, resolveWorkspacePaths } from '../runtime/WorkspaceBootstrap.js';
import { KyberRuntime } from '../runtime/KyberRuntime.js';
import { KyberAnalyticsDb } from '../observability/KyberAnalyticsDb.js';
import { parseSinceToMs } from '../observability/parseSince.js';

const KK_MD_TEMPLATE = `# KK.md

Project-specific user directives and agent behavior guidelines go here.
`;

const AGENT_TS_TEMPLATE = `import { KyberRuntime } from 'kyberkit';

async function main() {
  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const agent = runtime.createAgent();

  console.log('Agent initialized with ID:', agent.id);
}

main().catch(console.error);
`;

const SKILL_EXAMPLE_TEMPLATE = `---
name: "hello_world"
description: "A simple hello world skill"
---

# Instructions
When asked to say hello, reply with: "Hello from KyberKit Skill!"
`;

const ENV_EXAMPLE_TEMPLATE = `# === Model Provider ===
# Kevin v1.5 §8.4 — Anthropic SDK 一统；KYBER_MODEL_PROVIDER 已废弃。
KYBER_MODEL_NAME=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=

# === Agent ===
KYBER_AGENT_NAME=default-agent
# KYBER_AGENT_SYSTEM_PROMPT=You are a helpful assistant.

# === Permissions ===
# KYBER_PERMS_ALLOWED=read_fs,exec_shell,read_net,read_env
# KYBER_PERMS_DENIED=
# KYBER_PERMS_ALLOWED_PATHS=./

# === Skills ===
# KYBER_SKILL_PATHS=./skills
`;

export async function initProject(projectName: string): Promise<void> {
  const root = join(process.cwd(), projectName);

  // Create directory structure
  await mkdir(join(root, 'src', 'tools'), { recursive: true });
  await mkdir(join(root, 'src', 'prompts'), { recursive: true });
  await mkdir(join(root, 'skills', 'example'), { recursive: true });
  await mkdir(join(root, 'mcp'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });

  // Create templates
  await writeFile(join(root, 'KK.md'), KK_MD_TEMPLATE);
  await writeFile(join(root, 'src', 'agent.ts'), AGENT_TS_TEMPLATE);
  await writeFile(join(root, 'skills', 'example', 'SKILL.md'), SKILL_EXAMPLE_TEMPLATE);
  await writeFile(join(root, '.env'), ENV_EXAMPLE_TEMPLATE);

  console.log(`\n✓ Project "${projectName}" created at ${root}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  # Edit .env and set ANTHROPIC_API_KEY`);
  console.log(`  bun run src/agent.ts\n`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * Main CLI dispatcher. Called from bin/kyberkit with process.argv.slice(2).
 * Supports: chat (default), init, --help, --version
 */
export async function run(argv: string[] = []): Promise<void> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'init':
      return runInit(rest);
    case 'trajectory':
      return runTrajectoryCli(rest);
    case 'chat':
    case undefined:
      return runChat(rest);
    case '--help':
    case '-h':
      printUsage();
      return;
    case '--version':
    case '-v':
      console.log('kyberkit v2.0.0-sprint3');
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
Usage: kyberkit [command] [options]

Commands:
  chat           Start the interactive REPL (default)
  init [name]    Scaffold a new KyberKit project
  trajectory     Export local trajectory DB (JSONL)

Options:
  --help, -h     Show this help
  --version, -v  Show version

Chat options:
  --workspace <id>      Workspace ID (default: "default")
  --no-tui              Fallback to plain readline mode
  --verbose             (no-tui) Full event stream: [phase], tools, token lines
  --log-file <path>     (no-tui) Append [phase] lines to a debug log file
  --reliability <mode>  real | inmemory (default: real)

Trajectory export:
  kyberkit trajectory export [--since 7d]
`);
}

function formatDurMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

async function runTrajectoryCli(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub !== 'export') {
    console.error('Usage: kyberkit trajectory export [--since 7d]');
    process.exit(1);
  }
  const rest = args.slice(1);
  const sinceIdx = rest.indexOf('--since');
  const sinceRaw = sinceIdx >= 0 ? rest[sinceIdx + 1] ?? '7d' : '7d';
  const sinceMs = parseSinceToMs(sinceRaw);
  const root = join(process.cwd(), '.kyberkit', 'runtime');
  let files: string[];
  try {
    files = readdirSync(root).filter((f) => f.endsWith('.trajectory.sqlite'));
  } catch {
    console.error(`No runtime directory at ${root}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error('No *.trajectory.sqlite files found.');
    process.exit(1);
  }
  for (const f of files) {
    const db = new KyberAnalyticsDb(join(root, f));
    try {
      for (const { line } of db.exportEventsJsonlSince(sinceMs)) {
        process.stdout.write(`${line}\n`);
      }
    } finally {
      db.close();
    }
  }
}

async function runInit(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    await initDefaultWorkspace();
  } else {
    await initProject(name);
  }
}

async function runChat(args: string[]): Promise<void> {
  const noTui = args.includes('--no-tui');
  const verbose = args.includes('--verbose');
  const logIdx = args.indexOf('--log-file');
  const logFile = logIdx !== -1 ? args[logIdx + 1] : undefined;
  const reliabilityIdx = args.indexOf('--reliability');
  const reliabilityMode = reliabilityIdx !== -1 ? args[reliabilityIdx + 1] : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Please set it in .env (see .env.example).');
    process.exit(1);
  }

  // Non-TTY or --no-tui → plain readline fallback
  if (noTui || !process.stdin.isTTY) {
    return runReadlineFallback(reliabilityMode, { verbose, logFile });
  }

  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const session = await runtime.createSession({
    reliability: (reliabilityMode ?? process.env.KYBER_RELIABILITY ?? 'real') as 'real' | 'inmemory',
  });

  // Lazy-import Ink to avoid loading React in non-TUI mode
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('../tui/App.js');

  console.log(`KyberKit ${runtime.getConfig().model.name} · workspace=${runtime.getActiveWorkspace().config.workspaceId}`);
  console.log('Type a message to start. /help for commands, Ctrl+D to exit.\n');

  const { waitUntilExit } = render(
    React.createElement(App, { runtime, session }),
  );

  await waitUntilExit();
  await session.close();
}

async function runReadlineFallback(
  reliabilityMode?: string,
  opts: { verbose?: boolean; logFile?: string } = {},
): Promise<void> {
  const { createInterface } = await import('readline');
  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const session = await runtime.createSession({
    reliability: (reliabilityMode ?? process.env.KYBER_RELIABILITY ?? 'real') as 'real' | 'inmemory',
  });

  const verbose = opts.verbose === true;
  console.log('KyberKit REPL (no-tui mode)');
  console.log(`Model: ${runtime.getConfig().model.name}`);
  console.log(verbose ? 'Verbose: on ([phase] / full tool output).' : 'Compact progress lines (use --verbose for debug).');
  console.log('Type a message, /quit to exit.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question('\n> ', handleInput);

  const logPhase = async (line: string) => {
    if (!opts.logFile) return;
    await appendFile(opts.logFile, line, 'utf-8').catch(() => {});
  };

  const handleInput = async (input: string) => {
    const trimmed = input.trim();
    if (trimmed === '/quit' || trimmed === '/exit') {
      await session.close();
      rl.close();
      process.exit(0);
    }
    if (!trimmed) {
      prompt();
      return;
    }

    let lastEv = Date.now();
    const turnStart = Date.now();
    let toolCalls = 0;
    const heart =
      verbose
        ? null
        : setInterval(() => {
            const idle = Date.now() - lastEv;
            if (idle < 3000) return;
            const line = `  … 运行中 ${formatDurMs(Date.now() - turnStart)} · ${toolCalls} 工具\n`;
            process.stdout.write(line);
          }, 3000);

    try {
      if (!verbose) {
        const title = trimmed.replace(/\s+/g, ' ').slice(0, 72);
        process.stdout.write(`\n› ${title}\n`);
      }

      for await (const event of session.send(trimmed)) {
        lastEv = Date.now();

        if (verbose) {
          if (event.type === 'text_delta') process.stdout.write(event.text);
          if (event.type === 'thinking_delta') process.stdout.write(event.text);
          if (event.type === 'tool_use_start') process.stdout.write(`\n[tool] ${event.toolName}…\n`);
          if (event.type === 'tool_result') {
            const head = event.result.length > 400 ? `${event.result.slice(0, 400)}…` : event.result;
            process.stdout.write(
              `\n[tool result] ${event.toolName}${event.isError ? ' (error)' : ''}\n${head}\n`,
            );
          }
          if (event.type === 'turn_phase') {
            const line = `\n[phase] ${event.phase}\n`;
            process.stdout.write(line);
            void logPhase(line);
          }
          if (event.type === 'usage') {
            process.stdout.write(`\n[${event.usage.inputTokens}in/${event.usage.outputTokens}out]\n`);
          }
          continue;
        }

        // Compact mode
        if (event.type === 'thinking_delta') continue;
        if (event.type === 'text_delta') process.stdout.write(event.text);
        if (event.type === 'task_plan') {
          process.stdout.write(`  计划 (${event.source}): ${event.steps.map((s) => s.title).join(' → ')}\n`);
        }
        if (event.type === 'task_narration') {
          process.stdout.write(`  · ${event.text}\n`);
        }
        if (event.type === 'tool_use_start') {
          toolCalls++;
          process.stdout.write(`  … ${event.toolName}\n`);
        }
        if (event.type === 'tool_result') {
          const sym = event.isError ? '✗' : '✓';
          const head = event.result.split('\n')[0] ?? '';
          const tail = head.length > 100 ? `${head.slice(0, 99)}…` : head;
          process.stdout.write(`  ${sym} ${event.toolName}${event.isError ? ' (error)' : ''} ${tail}\n`);
        }
        if (event.type === 'turn_phase') {
          const line = `[phase] ${event.phase}\n`;
          void logPhase(line);
        }
        if (event.type === 'usage') {
          process.stdout.write(
            `\n  [${event.usage.inputTokens}in/${event.usage.outputTokens}out · cum ${event.cumulative.totalInputTokens}in]\n`,
          );
        }
      }
    } catch (err) {
      console.error('[error]', err);
    } finally {
      if (heart) clearInterval(heart);
      prompt();
    }
  };

  prompt();
}

// ─── Workspace helpers ────────────────────────────────────────────────────────

export async function initDefaultWorkspace(userName: string = 'default'): Promise<void> {
  const paths = resolveWorkspacePaths({ cwd: process.cwd(), userName, workspaceId: 'default' });
  const result = await ensureWorkspaceSeed({
    userRoot: paths.userRoot,
    projectKKPath: join(process.cwd(), 'KK.md'),
  });

  await mkdir(paths.workspaceRoot, { recursive: true });

  console.log(`\n✓ Workspace "${paths.userName}" initialized at ${result.userRoot}`);
  if (result.createdFiles.length > 0) {
    console.log(`  Seeded ${result.createdFiles.length} files.`);
  } else {
    console.log('  Existing workspace content preserved (no files overwritten).');
  }
}
