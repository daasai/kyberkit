/**
 * Non-interactive streaming test — thin shell over the unified AgentSession entry point.
 *
 * Runs a multi-turn conversation without readline.
 * Uses the full runtime path: KK.md persona, PromptAssembler, CommandRegistry,
 * and real ReliabilityLayer.
 *
 * Usage: bun run scripts/stream-test.ts
 * Set KYBER_RELIABILITY=inmemory to skip persistence.
 */

import { KyberRuntime } from '../src/runtime/KyberRuntime.js';

async function askSession(
  session: import('../src/runtime/AgentSession.js').AgentSession,
  message: string,
): Promise<{ text: string; turnNumber: number }> {
  let text = '';
  let turnNumber = 0;

  for await (const event of session.send(message)) {
    switch (event.type) {
      case 'text_delta':
        text += event.text;
        process.stdout.write(event.text);
        break;
      case 'tool_use_start':
        process.stdout.write(`\n[tool] ${event.toolName}...\n`);
        break;
      case 'tool_result':
        process.stdout.write(`[tool ok] ${event.toolName}: ${event.result.slice(0, 80)}\n`);
        break;
      case 'usage':
        process.stdout.write(`\n[usage] ${event.usage.inputTokens} in / ${event.usage.outputTokens} out\n`);
        break;
      case 'turn_complete':
        turnNumber = event.turnNumber;
        break;
      case 'error':
        process.stdout.write(`\n[error] ${event.error.message}\n`);
        break;
    }
  }

  process.stdout.write(`\n--- Turn ${turnNumber} complete ---\n\n`);
  return { text, turnNumber };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  console.log('KyberKit streaming test — full application entry\n');

  const runtime = new KyberRuntime();
  await runtime.bootstrap();

  const session = await runtime.createSession();

  console.log(`Session ID : ${session.id}`);
  console.log(`Model      : ${runtime.getConfig().model.name}`);
  console.log(`Reliability: ${process.env.KYBER_RELIABILITY ?? 'real'}\n`);

  const prompts = [
    '你好，请简单介绍一下你自己',
    '请写一段 TypeScript 代码来实现一个简单的 HTTP GET 请求封装',
    '谢谢，请列举3种设计模式及其适用场景',
  ];

  for (const message of prompts) {
    console.log(`User: ${message}`);
    console.log('Agent: ');
    await askSession(session, message);
  }

  await session.close();
  console.log('All turns completed successfully.');
}

main().catch(console.error);
