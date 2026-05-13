/**
 * Match a file path (POSIX, relative) against a simple glob pattern.
 * Supports `*`, `**`, and `?` (single segment).
 */
export function matchSimpleGlob(relativePath: string, pattern: string): boolean {
  const norm = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const pat = pattern.replace(/\\/g, '/');
  const parts = pat.split('/');
  return matchParts(norm.split('/').filter(Boolean), parts);
}

function matchParts(pathParts: string[], patternParts: string[]): boolean {
  return matchFrom(0, 0);

  function matchFrom(pi: number, gi: number): boolean {
    if (gi >= patternParts.length) return pi >= pathParts.length;
    const g = patternParts[gi];
    if (g === '**') {
      if (gi === patternParts.length - 1) return true;
      for (let i = pi; i <= pathParts.length; i++) {
        if (matchFrom(i, gi + 1)) return true;
      }
      return false;
    }
    if (pi >= pathParts.length) return false;
    if (!matchSegment(pathParts[pi], g)) return false;
    return matchFrom(pi + 1, gi + 1);
  }
}

function matchSegment(name: string, pattern: string): boolean {
  if (pattern === '**') return true;
  const re = globSegmentToRegex(pattern);
  return re.test(name);
}

function globSegmentToRegex(pattern: string): RegExp {
  let s = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      s += '.*';
    } else if (c === '?') {
      s += '.';
    } else if ('.^$+()[]{}|\\'.includes(c)) {
      s += '\\' + c;
    } else {
      s += c;
    }
  }
  return new RegExp(`^${s}$`);
}
