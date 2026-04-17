import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureWorkspaceSeed, resolveWorkspacePaths } from '../runtime/WorkspaceBootstrap.js';
import { KyberRuntime } from '../runtime/KyberRuntime.js';

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
KYBER_MODEL_PROVIDER=anthropic
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

Options:
  --help, -h     Show this help
  --version, -v  Show version

Chat options:
  --workspace <id>      Workspace ID (default: "default")
  --no-tui              Fallback to plain readline mode
  --reliability <mode>  real | inmemory (default: real)
`);
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
  const reliabilityIdx = args.indexOf('--reliability');
  const reliabilityMode = reliabilityIdx !== -1 ? args[reliabilityIdx + 1] : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Please set it in .env (see .env.example).');
    process.exit(1);
  }

  // Non-TTY or --no-tui → plain readline fallback
  if (noTui || !process.stdin.isTTY) {
    return runReadlineFallback(reliabilityMode);
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

async function runReadlineFallback(reliabilityMode?: string): Promise<void> {
  const { createInterface } = await import('readline');
  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const session = await runtime.createSession({
    reliability: (reliabilityMode ?? process.env.KYBER_RELIABILITY ?? 'real') as 'real' | 'inmemory',
  });

  console.log('KyberKit REPL (no-tui mode)');
  console.log(`Model: ${runtime.getConfig().model.name}`);
  console.log('Type a message, /quit to exit.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question('\n> ', handleInput);

  const handleInput = async (input: string) => {
    const trimmed = input.trim();
    if (trimmed === '/quit' || trimmed === '/exit') {
      await session.close();
      rl.close();
      process.exit(0);
    }
    if (!trimmed) { prompt(); return; }

    try {
      for await (const event of session.send(trimmed)) {
        if (event.type === 'text_delta') process.stdout.write(event.text);
        if (event.type === 'tool_use_start') process.stdout.write(`\n[tool] ${event.toolName}…\n`);
        if (event.type === 'usage') process.stdout.write(`\n[${event.usage.inputTokens}in/${event.usage.outputTokens}out]\n`);
      }
    } catch (err) {
      console.error('[error]', err);
    } finally {
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
