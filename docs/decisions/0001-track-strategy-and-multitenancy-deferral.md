# ADR-0001: Track strategy, product decisions, and multitenancy deferral

**Status:** Accepted  
**Date:** 2026-04-26  
**Context:** KyberKit v2.0 "User grows Agent" positioning, Track B (asset evolution) priority.

## Decisions

1. **Skill suggestion output (Q1 = C — semi-automatic)**  
   Suggested Skills are **drafts only** until the user reviews (editor) or confirms save. No silent writes of `SKILL.md`.

2. **Hook layers priority (Q2 = B)**  
   Defer the full **Internal** hook layer to post–Track B planning. **Event** + **User Shell** hooks remain the next focus after Track B, subject to a separate spec.

3. **Multi-agent collaboration (Q3 = A — parent/child SubAgent, tight coupling)**  
   One primary Agent and **N** sub-agents share context within a single user session. Cross-tenant and cross-user isolation is **out of scope for v2.0** (see below).

4. **Multitenancy**  
   Per-tenant workspaces, separate memories/knowledge/keys, and a multi-tenant runtime are **deferred to v3.0**. v2.0 assumes a **default single workspace** (current `.kyberkit` layout) without `tenantId` in product guarantees.

5. ** Engineering hygiene for v3.0**  
   Prefer **injecting dependencies** and avoiding new **global** singletons for v2.0 features so a future `WorkspaceContext` can wrap paths and credentials without a full rewrite.

6. **Track B before Track A / C (execution order)**  
   Implement **Track B (asset evolution)** first. **Track A** (prompt cache, hooks, parallel tools) and **Track C** (coordinator, TUI v2) are re-planned after Track B ships, using real usage data from Track B.

## Consequences

- `docs/v2-upgrade-plan.md` and sprint specs are aligned to Track B deliverables for the current phase.
- Multitenancy design docs may exist as *future* notes; they are **non-normative** for v2.0 code.
