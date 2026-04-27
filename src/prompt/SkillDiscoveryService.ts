import * as path from 'path';
import type { SkillMeta } from '../tools/skills/SkillMeta.js';
import { matchSimpleGlob } from '../tools/builtin/globMatch.js';

export interface SkillDiscoveryInput {
  /** Latest natural-language user turn (plain text). */
  userText: string;
  cwd: string;
}

/**
 * Select skills whose activation rules match the current turn (deterministic first).
 */
export function discoverActiveSkills(metas: SkillMeta[], input: SkillDiscoveryInput): SkillMeta[] {
  const text = input.userText;
  const lower = text.toLowerCase();
  const hits: SkillMeta[] = [];

  for (const m of metas) {
    let matched = false;

    for (const ap of m.activationPaths) {
      const paths = extractLikelyPaths(text, input.cwd);
      for (const p of paths) {
        const rel = tryRelative(p, input.cwd);
        if (rel && matchSimpleGlob(rel.replace(/\\/g, '/'), ap.replace(/\\/g, '/'))) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched && m.whenToUse) {
      const tokens = m.whenToUse
        .toLowerCase()
        .split(/[\s,，。；;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      matched = tokens.some((t) => lower.includes(t));
    }

    if (matched) hits.push(m);
  }

  return dedupeByName(hits);
}

function dedupeByName(metas: SkillMeta[]): SkillMeta[] {
  const seen = new Set<string>();
  return metas.filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}

/** Pull quoted paths and bare path-like tokens from user text. */
function extractLikelyPaths(text: string, cwd: string): string[] {
  const out: string[] = [];
  const quoted = text.match(/['"]([^'"]+\.(csv|xlsx|xls|ts|tsx|js|json|md))['"]/gi);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/^['"]|['"]$/g, '');
      out.push(path.resolve(cwd, inner));
    }
  }
  const slashPaths = text.match(/[\w./\\~-]+\.(csv|xlsx|xls)/gi);
  if (slashPaths) {
    for (const s of slashPaths) {
      if (!s.includes('/') && !s.includes('\\')) continue;
      out.push(path.resolve(cwd, s));
    }
  }
  return out;
}

function tryRelative(abs: string, cwd: string): string | null {
  const rel = path.relative(cwd, abs);
  if (rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}
