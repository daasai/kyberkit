import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * EnvironmentProvider — Provides static and dynamic environment metadata.
 * Priority 4 (lowest), can be dropped if budget is exceeded.
 *
 * Sprint 2, Step 5.
 */
export class EnvironmentProvider implements PromptSectionProvider {
  readonly id = 'environment';
  readonly priority = 4;
  readonly cacheable = false;
  readonly source = 'dynamic' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    const lines = ['# Environment'];
    if (context.cwd) lines.push(`- Working Directory: ${context.cwd}`);
    lines.push(`- OS: ${process.platform} ${process.arch}`);
    lines.push(`- Time: ${new Date().toISOString()}`);

    try {
      // Lazy import to avoid unnecessary overhead in all environments
      const { execSync } = await import('child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: context.cwd, 
        encoding: 'utf-8', 
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'] 
      }).trim();
      lines.push(`- Git Branch: ${branch}`);
    } catch { 
      /* not a git repo or no git command */ 
    }

    return lines.join('\n');
  }
}
