/**
 * Interactive REPL — thin shell over the unified AgentSession entry point.
 *
 * Prerequisites: Set ANTHROPIC_API_KEY in .env (see .env.example)
 * Usage: bun run scripts/repl-test.ts
 *
 * Type a message to talk to the agent, /quit to exit.
 * The session uses the full runtime path: KK.md persona, PromptAssembler,
 * CommandRegistry, and real ReliabilityLayer.
 *
 * Set KYBER_RELIABILITY=inmemory to skip persistence (useful for quick tests).
 */

import * as readline from 'node:readline';
import { KyberRuntime } from '../src/runtime/KyberRuntime.js';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Please set it in .env (see .env.example for reference).');
    process.exit(1);
  }

  console.log('KyberKit REPL — full application entry\n');

  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const session = await runtime.createSession();

  console.log(`Session ID : ${session.id}`);
  console.log(`Agent ID   : ${session.agent.id}`);
  console.log(`Model      : ${runtime.getConfig().model.name}`);
  console.log(`API Base   : ${runtime.getConfig().model.baseUrl ?? '(default)'}`);
  console.log(`Reliability: ${process.env.KYBER_RELIABILITY ?? 'real'}`);
  console.log('Type a message to chat, /quit to exit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => rl.question('\n> ', handleInput);

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

    let responseText = '';
    let thinkingText = '';
    let toolCount = 0;
    let turnNumber = 0;
    let hasError = false;

    try {
      for await (const event of session.send(trimmed)) {
        switch (event.type) {
          case 'text_delta':
            responseText += event.text;
            process.stdout.write(event.text);
            break;

          case 'thinking_delta':
            thinkingText += event.text;
            break;

          case 'tool_use_start':
            toolCount++;
            process.stdout.write(`\n[tool] ${event.toolName}...\n`);
            break;

          case 'tool_result':
            if (event.isError) {
              process.stdout.write(`[tool error] ${event.toolName}: ${event.result}\n`);
            } else {
              const preview = event.result.length > 100
                ? `${event.result.slice(0, 100)}...`
                : event.result;
              process.stdout.write(`[tool ok] ${event.toolName}: ${preview}\n`);
            }
            break;

          case 'usage':
            process.stdout.write(
              `\n[usage] ${event.usage.inputTokens} in / ${event.usage.outputTokens} out\n`,
            );
            break;

          case 'turn_complete':
            turnNumber = event.turnNumber;
            break;

          case 'error':
            hasError = true;
            process.stdout.write(`\n[error] ${event.error.message}\n`);
            break;

          case 'status':
            process.stdout.write(`\n[status] ${event.status}${event.message ? ` — ${event.message}` : ''}\n`);
            break;
        }
      }

      if (!hasError) {
        process.stdout.write(`\n\n[Turn ${turnNumber} complete | ~${responseText.length} chars]\n`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[fatal] ${msg}\n`);
    } finally {
      // suppress unused warnings
      void thinkingText;
      void toolCount;
      prompt();
    }
  };

  prompt();
}

main().catch(console.error);
