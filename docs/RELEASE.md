# KyberKit release lines

KyberKit is consumed by **Kevin 1.5** (stable) and **Kevin 2.0** (monorepo). Source of truth is this repository only.

## Branches

| Branch | SemVer | Consumers |
|--------|--------|-----------|
| `release/1.x` | `1.x` | Kevin 1.5 submodule / npm `^1` |
| `release/2.0` | `2.0.0-alpha.x` and later `2.x` | Kevin 2.0 monorepo submodule |

`main` tracks ongoing development; release branches receive cherry-picks and tagged releases.

## Tags

- **1.x**: `v1.0.0`, `v1.0.1`, … — compatible fixes and small features for Kevin 1.5.
- **2.x**: `v2.0.0-alpha.1`, … — breaking or Kevin-2-only APIs (e.g. `src/kevin2/`).

## Checklist (maintainers)

1. Land changes via PR on the appropriate release branch (or `main` then backport).
2. Run `bun install` and `bun test ./src`.
3. Bump `package.json` `version` (SemVer).
4. Tag `v<version>` and push tags.
5. Bump submodule pointers in `daasai/kevin` (2.0) and kevin1.5 repos.

## Submodule clone

```bash
git submodule update --init --recursive
```
