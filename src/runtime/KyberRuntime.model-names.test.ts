import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Harness directories that must not hardcode model names
const HARNESS_DIRS = [
  join(import.meta.dir, '../runtime'),
  join(import.meta.dir, '../agent'),
  join(import.meta.dir, '../task'),
  join(import.meta.dir, '../eval'),
  join(import.meta.dir, '../memory'),
  join(import.meta.dir, '../skills'),
  join(import.meta.dir, '../scale'),
];

// Provider files are exempt
const EXEMPT_FILES = new Set(['AnthropicProvider.ts', 'AnthropicProvider.js']);

const FORBIDDEN_MODEL_STRINGS = ['claude-', 'gpt-4', 'gpt-3'];

function collectTs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.includes('.test.') && !EXEMPT_FILES.has(f))
      .map((f) => join(dir, f));
  } catch { return []; }
}

describe('Harness model-name hygiene (§2.6)', () => {
  for (const d of HARNESS_DIRS) {
    const files = collectTs(d);
    for (const file of files) {
      const shortName = file.split('/').slice(-2).join('/');
      it(`"${shortName}" must not hardcode model names`, () => {
        const src = readFileSync(file, 'utf-8');
        const noComments = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const forbidden of FORBIDDEN_MODEL_STRINGS) {
          expect(noComments.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      });
    }
  }
});
