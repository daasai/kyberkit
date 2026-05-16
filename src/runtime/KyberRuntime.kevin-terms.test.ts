import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(import.meta.dir, 'KyberRuntime.ts'),
  'utf-8',
);

// These Kevin product terms must not appear in KyberRuntime logic.
const FORBIDDEN_IN_LOGIC = [
  'kevinLibraryLexiconSection',
  'libraryMountPath',
  'libraryTechRoot',
];

describe('KyberRuntime Kevin-vocabulary hygiene', () => {
  for (const term of FORBIDDEN_IN_LOGIC) {
    it(`must not contain "${term}"`, () => {
      // Strip single-line comments before checking
      const noComments = src.replace(/\/\/.*/g, '');
      expect(noComments).not.toContain(term);
    });
  }
});
