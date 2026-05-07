# Kevin v1.5 UAT Full Remediation Design

Date: 2026-05-06  
Status: Draft for user review  
Scope: Full remediation based on `docs/specs/kevin1.5/UAT/uat_report_v1.5.md` and `docs/specs/kevin1.5/UAT/ux_walkthrough_report_2026-05-06.md`

## 1. Goals And Success Criteria

This design defines a full UAT remediation pass for Kevin v1.5, covering release-blocking behavior gaps and UX architecture gaps in one structured execution stream.

Success criteria:

- Space behavior follows strict independent-window semantics.
- Runtime and sidecar events fully surface in frontend status UX.
- Left, center, and right panels have unambiguous role boundaries.
- Dynamic Island is redesigned as a compact status bar (not input-like).
- UAT replay can validate all major findings as resolved.

## 2. Execution Strategy

Recommended strategy: vertical-slice remediation in three waves.

- Wave 1: Space system (anchor, menu, window semantics)
- Wave 2: Task feedback system (event chain + status presentation)
- Wave 3: Information architecture and right-panel semantic convergence

Reasoning:

- Each wave is independently testable.
- UX decisions can be validated incrementally.
- Risk is contained without stalling on large foundational rewrites.

## 3. Wave 1: Space System Design

### 3.1 Architecture

Space switching uses a three-layer model:

- UI layer: bottom anchor and selection menu.
- Application layer: switch orchestration and guard logic.
- Runtime/window layer: open/focus window capabilities and mapping.

### 3.2 UX And Component Contract

- Bottom-left fixed `Space Switcher` replaces `Upgrade Plan` in primary flow.
- Menu style follows Obsidian-like list with:
  - Current item checkmark and highlight
  - Manage entry (`Manage Space...`)
  - Optional secondary metadata (last visited)
- Red dot in list row is reserved for `awaiting-signoff` only.

### 3.3 Interaction Semantics (Locked Decision)

Decision: A1 strict PRD behavior.

- Selecting non-current space must open and focus a dedicated window.
- In-place replacement in current window is disallowed.
- Selecting current space only closes menu or re-focuses current window.
- Keyboard traversal is supported in menu and aligns with window cycling behavior.

### 3.4 Error Handling

- Open failure: non-destructive toast + menu remains actionable.
- Focus failure: one fallback reopen-and-focus attempt.
- Invalid space metadata: disabled row + guided recovery via manage flow.

### 3.5 Verification

- Unit tests for open/focus routing.
- Integration tests for menu-to-window behavior consistency.
- UAT checks for anchor placement, menu affordance, and strict window semantics.

## 4. Wave 2: Task Feedback System Design

### 4.1 Event Chain Completion

Complete event propagation:

`KyberRuntime` -> sidecar bus subscription -> SSE broadcast -> frontend store -> UI surfaces

Critical fix:

- Subscribe and broadcast `skill.suggested` from sidecar so frontend can render suggestion prompts.

### 4.2 Canonical Event Types

- `task.started`
- `task.progress`
- `task.awaiting_signoff`
- `task.completed`
- `skill.suggested`

`skill.suggested` is treated as an auxiliary recommendation signal, not a task-state override.

### 4.3 Dynamic Island Redesign (Final Decision: B)

Dynamic Island is redesigned as a compact notification bar:

- Thin, non-input visual profile.
- No caret/placeholder/input affordance.
- Single-line glanceable status copy.

Four states:

- Idle: neutral session status line.
- Running: compact progress and ETA cue.
- Awaiting signoff: high-priority warning style.
- Completed: short success transient (3 seconds), then returns to idle.

Priority model:

- `awaiting_signoff` > `running` > `completed_transient` > `idle`

### 4.4 Reliability And Observability

- Reconnect strategy includes replay of recent server events to avoid missed prompts.
- De-duplication guard for repeated recommendation events in short windows.
- Sidecar metrics and logs for failed broadcast or malformed payloads.
- Frontend graceful fallback routes unknown recommendation payloads to notification center.

### 4.5 Verification

- Unit tests for event forwarding and UI state priority.
- Integration tests for runtime-to-frontend recommendation visibility.
- Replay tests for disconnect/reconnect event recovery.

## 5. Wave 3: IA And Right-Panel Semantic Convergence

### 5.1 Left Panel Information Architecture

Split `Context & Sources` into two clear blocks:

- Document Library
- Connectors

Document Library:

- Tree browsing aligned with workspace context.
- Fast actions: `@reference` and optional path copy.
- Recent references section (3-5 items).

Connectors:

- Default summary view with healthy/error counts.
- Expandable detail rows: status, failure reason, last success timestamp.
- Recovery actions: reconnect/reauthorize.
- Error entries sorted first.

### 5.2 Conversation History Discoverability

- Default 6-row history viewport with `Show more`.
- Hover actions for pin/archive.
- Row-level signoff indicator for `awaiting-signoff`.

### 5.3 Right Panel Role Narrowing

Right panel contains only:

- Conversation and input flow
- Process tracker
- Context attribution summary

Right panel must not host full artifact primary views. Artifact creation, reading, and editing remain centered in the middle panel.

### 5.4 Welcome Area Copy Correction

- Remove all copy implying preinstalled skills.
- Replace with guided onboarding for `@file`, attachments, natural-language tasks, and slash usage for installed skills.
- Example copy must explicitly note examples are not preinstalled capabilities.

## 6. Data Flow Summary

- User command starts in right panel input.
- Runtime schedules and emits task and recommendation events.
- Sidecar streams canonical events via SSE.
- Compact top status bar reflects highest-priority current state.
- Middle panel remains artifact destination and review workspace.
- Notification center and history rows mirror key state and signoff indicators.

## 7. Error Handling Principles

- Preserve user trust through explicit state and recovery affordances.
- Avoid silent state drops across runtime-sidecar-frontend boundaries.
- Keep warning semantics consistent across status bar, history rows, and signoff views.
- Keep failures localized: one subsystem fault should not collapse global UI behavior.

## 8. Test Plan

### 8.1 Wave-Gated Validation

- Gate 1 (Space): strict window behavior, anchor and menu checks.
- Gate 2 (Task feedback): event pipeline and compact status bar state checks.
- Gate 3 (IA and right panel): panel role clarity and recoverability checks.

### 8.2 Regression Coverage

- Multi-task queue behavior and status transitions.
- Signoff timeout flow and red-priority surfacing.
- Cross-space isolation behavior.
- Connector failure recovery visibility and actionability.

## 9. Risks And Mitigations

- Risk: UX scope drift while implementing full remediation.  
  Mitigation: lock wave acceptance criteria before coding each wave.

- Risk: duplicated or out-of-order UI state from concurrent events.  
  Mitigation: canonical event typing, short-window de-duplication, explicit priority reducer tests.

- Risk: panel role confusion returning through incremental patches.  
  Mitigation: enforce right-panel component boundary and center-panel artifact ownership in review checklist.

## 10. Out Of Scope

- Unrelated visual overhauls outside identified UAT findings.
- New capability tracks not required for v1.5 remediation acceptance.
- Broad architecture rewrites that do not improve current UAT closure.

## 11. Approval Checkpoint

This design captures agreed decisions:

- Full remediation scope (option C)
- Space behavior A1 (strict independent window switch)
- Dynamic Island visual direction B (compact notification bar)
- Right-panel semantic convergence as a process-and-input surface only

Upon user approval, the next step is implementation planning.
