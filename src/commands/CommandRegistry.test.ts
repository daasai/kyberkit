import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { CommandRegistry } from './CommandRegistry.js';
import { HelpCommand } from './builtin/HelpCommand.js';
import { CostCommand } from './builtin/CostCommand.js';
import { MemoryCommand } from './builtin/MemoryCommand.js';
import { CompactCommand } from './builtin/CompactCommand.js';
import { CommandContext } from '../types/command.js';

describe('Command System', () => {
  let registry: CommandRegistry;
  let context: CommandContext;

  beforeEach(() => {
    registry = new CommandRegistry();
    context = {
      cwd: '/test/cwd',
      cumulative: {
        turnCount: 2,
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 10
      }
    };
  });

  it('should register and execute builtin commands', async () => {
    registry
      .register(new HelpCommand(() => registry.list()))
      .register(new CostCommand())
      .register(new MemoryCommand(() => [{ id: 'm1', scope: 'user', absolutePath: '/p1', relativePath: 'm1', type: 'memory', lastModified: 0 }]))
      .register(new CompactCommand());

    // Test /help
    const helpRes = await registry.execute('/help', context);
    expect(helpRes.success).toBe(true);
    expect(helpRes.output).toContain('Show all available commands');
    expect(helpRes.output).toContain('/cost');

    // Test /cost
    const costRes = await registry.execute('/cost', context);
    expect(costRes.success).toBe(true);
    expect(costRes.output).toContain('Input Tokens**: 100');
    expect(costRes.output).toContain('Estimated Cost**: $0.001');


    // Test /memory list
    const memRes = await registry.execute('/memory list', context);
    expect(memRes.success).toBe(true);
    expect(memRes.output).toContain('m1');

    // Test /compact
    const compactRes = await registry.execute('/compact', context);
    expect(compactRes.success).toBe(true);
    expect(compactRes.output).toContain('Sprint 4');
  });

  it('should handle unknown commands', async () => {
    const res = await registry.execute('/unknown', context);
    expect(res.success).toBe(false);
    expect(res.output).toContain('Unknown command');
  });

  it('should parse arguments', async () => {
    const testCmd = {
      name: 'test',
      description: 'test',
      execute: mock(async (args: any) => ({ output: args._raw, success: true, continueConversation: false }))
    };
    registry.register(testCmd as any);

    await registry.execute('/test arg1 arg2', context);
    expect(testCmd.execute).toHaveBeenCalledWith({ _raw: 'arg1 arg2' }, context);
  });
});
