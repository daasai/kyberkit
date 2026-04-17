/**
 * Sprint 2 Workspace Demo — unified AgentSession entry point.
 *
 * Demonstrates:
 *   - Asset discovery (KK.md / memories / skills / commands) under spaces/default
 *   - /help and /memory list command execution
 *   - Natural language query with full KK.md persona injection
 *
 * Usage: bun run demo:sprint2
 * Prerequisites: ANTHROPIC_API_KEY set in .env
 */

import { initDefaultWorkspace } from '../src/cli/init.js';
import { KyberRuntime } from '../src/runtime/KyberRuntime.js';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const userName = process.env.KYBER_USER_NAME ?? 'default';
  await initDefaultWorkspace(userName);

  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const workspace = runtime.getActiveWorkspace();
  const manifest = workspace.assets.getManifest();
  const mergedKK = workspace.assets.getMergedKKMd() ?? '';

  const totalAssets = manifest?.entries.length ?? 0;
  const memoryCount = manifest?.entries.filter(e => e.type === 'memory').length ?? 0;
  const skillCount = manifest?.entries.filter(e => e.type === 'skill').length ?? 0;
  const commandCount = manifest?.entries.filter(e => e.type === 'command').length ?? 0;

  console.log('\n=== Sprint 2 Workspace Demo ===');
  console.log(`Workspace  : ${workspace.config.workspaceId}`);
  console.log(`Assets     : total=${totalAssets}, memories=${memoryCount}, skills=${skillCount}, commands=${commandCount}`);
  console.log(`KK.md chars: ${mergedKK.length}`);
  console.log(`Reliability: ${process.env.KYBER_RELIABILITY ?? 'real'}\n`);

  // One session per demo run — accumulates messages across all three turns
  const session = await runtime.createSession();

  const collect = async (input: string): Promise<string> => {
    let output = '';
    for await (const event of session.send(input)) {
      if (event.type === 'text_delta') output += event.text;
    }
    return output.trim();
  };

  const help = await collect('/help');
  console.log('\n/help output:\n');
  console.log(help);

  const memories = await collect('/memory list');
  console.log('\n/memory list output:\n');
  console.log(memories);

  const natural = await collect('In one short sentence, summarize sprint2 capabilities.');
  console.log('\nNatural language output:\n');
  console.log(natural);

  await session.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
