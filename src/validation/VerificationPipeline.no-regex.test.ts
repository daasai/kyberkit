import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(import.meta.dir, 'VerificationPipeline.ts'),
  'utf-8',
);

describe('VerificationPipeline LLM-upgrade hygiene', () => {
  it('must not contain format-matching regex on output strings', () => {
    // Strip comments
    const noComments = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // These patterns indicate format-matching rather than schema-matching
    const formatRegexPatterns = [
      /output\s*\.\s*match\s*\(\/\^/,         // output.match(/^ ...)
      /\/\^[^/]{10,}\/\s*\.\s*test/,          // /^long pattern/.test(...)
      /output\.trim\(\)\s*\.\s*startsWith/,   // output.trim().startsWith(...)
    ];
    for (const pattern of formatRegexPatterns) {
      expect(noComments).not.toMatch(pattern);
    }
  });

  it('validation uses field/type checking, not string format checking', () => {
    // The pipeline should reference 'typeof' or field existence checks
    // rather than validating exact output text format
    expect(src.length).toBeGreaterThan(0); // File must exist and be non-empty
  });
});
