import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PromptAssembler } from './PromptAssembler.js';
import { IdentityProvider } from './providers/IdentityProvider.js';
import { UserDirectiveProvider } from './providers/UserDirectiveProvider.js';
import { ToolSchemaProvider } from './providers/ToolSchemaProvider.js';
import { MemoryProvider } from './providers/MemoryProvider.js';
import { EnvironmentProvider } from './providers/EnvironmentProvider.js';
import { AssemblyContext } from '../types/prompt.js';

describe('PromptAssembler and Providers', () => {
  let assembler: PromptAssembler;
  let context: AssemblyContext;

  beforeEach(() => {
    assembler = new PromptAssembler();
    context = {
      budget: 1000,
      cwd: '/test/cwd',
      tools: [
        { name: 't1', description: 'desc1', inputSchema: {} }
      ]
    };
  });

  it('should assemble a prompt with all providers', async () => {
    assembler
      .register(new IdentityProvider('Default Persona'))
      .register(new ToolSchemaProvider())
      .register(new UserDirectiveProvider(() => 'User Rules'))
      .register(new MemoryProvider())
      .register(new EnvironmentProvider());

    const result = await assembler.assemble({
      ...context,
      memoryContext: 'Memory Content'
    });


    expect(result.text).toContain('Default Persona');
    expect(result.text).toContain('## t1');
    expect(result.text).toContain('User Rules');
    expect(result.text).toContain('Memory Content');
    expect(result.text).toContain('Working Directory: /test/cwd');
    expect(result.sections).toHaveLength(5);
  });

  it('should respect priorities and budget', async () => {
    // Add a very large low-priority provider
    const largeContent = 'A'.repeat(5000); // ~1400 tokens
    
    assembler
      .register(new IdentityProvider('Small Identity')) // Priority 1
      .register(new EnvironmentProvider()); // Priority 4

    const result = await assembler.assemble({ ...context, budget: 10 }); // Tiny budget

    expect(result.text).toContain('Small Identity');
    expect(result.text).not.toContain('Working Directory'); // Priority 4 should be dropped
    expect(result.sections).toHaveLength(1);
  });

  it('should support workspace identity override', async () => {
    const provider = new IdentityProvider('Default', () => undefined);
    assembler.register(provider);

    const result1 = await assembler.assemble(context);
    expect(result1.text).toBe('Default');

    const result2 = await assembler.assemble({
      ...context,
      workspaceConfig: {
        workspaceId: 'ws1',
        name: 'Workspace 1',
        identityPrompt: 'Workspace Identity',
        assetPaths: { user: '.', project: '.' }
      }
    });
    expect(result2.text).toBe('Workspace Identity');
  });

  it('should skip providers returning null or empty', async () => {
    assembler
      .register(new IdentityProvider('Identity'))
      .register(new UserDirectiveProvider(() => null));

    const result = await assembler.assemble(context);
    expect(result.sections).toHaveLength(1);
    expect(result.text).toBe('Identity');
  });
});
