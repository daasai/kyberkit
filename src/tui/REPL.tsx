import React, { useCallback, useMemo } from 'react';
import { join } from 'path';
import { Box, useApp } from 'ink';
import { useSession } from './hooks/useSession.js';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts.js';
import { PromptInput } from './components/PromptInput.js';
import { ToolPermissionOverlay } from './components/ToolPermissionOverlay.js';
import { BatchAuthCard } from './components/BatchAuthCard.js';
import { IdentityBand } from './components/IdentityBand.js';
import { NarrativeBand } from './components/NarrativeBand.js';
import { ActionBand } from './components/ActionBand.js';
import { MemoryToastStack } from './components/MemoryToastStack.js';
import { AssetGrowthBanner } from './components/AssetGrowthBanner.js';
import { SkillSuggestionCard } from './components/SkillSuggestionCard.js';
import { useSessionContext } from './contexts/SessionContext.js';
import { resolveMission } from './utils/mission.js';

/**
 * REPL — Sprint 3.5 §3.2 three-band shell.
 *
 *   ┌────────────────────── IdentityBand ────────────────────┐  always visible
 *   │                                                        │
 *   │                     NarrativeBand                      │  scrolls, flexGrow
 *   │   (TranscriptView + live plan + narration)             │
 *   │                                                        │
 *   ├──────────────────────  ActionBand  ────────────────────┤  context cues
 *   │                       PromptInput                      │
 *   └────────────────────────────────────────────────────────┘
 */
export const REPL: React.FC = () => {
  const { runtime } = useSessionContext();
  const {
    state,
    dispatch,
    send,
    cancel,
    isBusy,
    toolPermissionPrompt,
    resolveToolPermission,
    batchAuthPrompt,
    resolveBatchAuth,
    revertMemoryToast,
    dismissMemoryToast,
    uiClock,
    lastEventAgeMs,
    skillDraft,
    clearSkillDraft,
  } = useSession();
  const { exit } = useApp();

  const config = runtime.getConfig();
  const agentName = config.agent?.name ?? 'KyberKit';
  const model = config.model.name;
  const workspace = runtime.getActiveWorkspace?.();
  const workspaceId = workspace?.config?.workspaceId ?? 'default';
  const permitStore = runtime.getPermitStore?.();
  // biome-ignore lint/correctness/useExhaustiveDependencies: uiClock drives ~1Hz re-evaluation so grants-mode edits surface without explicit event plumbing.
  const permissionMode = useMemo(() => permitStore?.modeLabel() ?? '严格', [permitStore, uiClock]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: uiClock is an intentional tick dependency — it forces this memo to re-evaluate ~1Hz so newly-scanned assets surface without additional event plumbing.
  const assetCounts = useMemo(() => {
    try {
      const manifest = workspace?.assets?.getManifest?.();
      if (!manifest) return undefined;
      return {
        memories: manifest.byType?.get?.('memory')?.length ?? 0,
        skills: manifest.byType?.get?.('skill')?.length ?? 0,
      };
    } catch {
      return undefined;
    }
  }, [workspace, uiClock]);

  const commandEntries = React.useMemo(() => {
    try {
      const cmds = workspace?.commandRegistry?.list() ?? [];
      const rows = cmds.map((c) => ({
        name: c.name,
        description: c.description ?? '',
      }));
      return [
        ...rows,
        { name: 'quit', description: '退出 TUI' },
        { name: 'exit', description: '退出 TUI' },
      ];
    } catch {
      return [
        { name: 'help', description: '显示全部命令' },
        { name: 'cost', description: '用量与费用' },
        { name: 'memory', description: '记忆相关' },
        { name: 'compact', description: '上下文压缩' },
        { name: 'quit', description: '退出 TUI' },
        { name: 'exit', description: '退出 TUI' },
      ];
    }
  }, [workspace]);

  useGlobalShortcuts({ onCancel: cancel, isBusy });

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '/quit' || trimmed === '/exit' || trimmed === 'quit') {
        exit();
        return;
      }
      send(trimmed);
    },
    [send, exit],
  );

  const activeTurn = state.turns.find(
    (t) => t.status === 'streaming' || t.status === 'executing_tools',
  );
  const anchorTurn = activeTurn ?? state.turns[state.turns.length - 1];
  const mission = resolveMission(anchorTurn);
  const elapsedTurnMs =
    isBusy && activeTurn?.turnStartedAtMs != null
      ? Date.now() - activeTurn.turnStartedAtMs
      : undefined;
  const toolsThisTurn = isBusy && activeTurn ? activeTurn.toolCalls.length : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: uiClock forces ~1Hz refresh of growth totals
  const growth7d = useMemo(() => {
    try {
      return runtime.getAssetGrowth7d?.();
    } catch {
      return undefined;
    }
  }, [runtime, uiClock]);

  const skillsDir = useMemo(() => {
    try {
      const u = workspace?.config?.assetPaths?.user;
      return u ? join(u, 'skills') : join(process.cwd(), '.kyberkit', 'skills');
    } catch {
      return join(process.cwd(), '.kyberkit', 'skills');
    }
  }, [workspace]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <IdentityBand
        agentName={agentName}
        mission={mission}
        turnStartedAtMs={activeTurn?.turnStartedAtMs}
        isBusy={isBusy}
        workspaceId={workspaceId}
        permissionMode={permissionMode}
        assetCounts={assetCounts}
        uiClockTick={uiClock}
      />

      {assetCounts && (assetCounts.memories ?? 0) + (assetCounts.skills ?? 0) > 0 ? (
        <AssetGrowthBanner
          memoryCount={assetCounts.memories ?? 0}
          skillCount={assetCounts.skills ?? 0}
          growth7d={growth7d}
        />
      ) : null}

      <NarrativeBand
        turns={state.turns}
        activeTurn={activeTurn}
        displayMode={state.displayMode}
        isBusy={isBusy}
      />

      <ActionBand
        cumulative={state.cumulative}
        isBusy={isBusy}
        model={model}
        elapsedTurnMs={elapsedTurnMs}
        toolsThisTurn={toolsThisTurn}
        lastEventAgeMs={isBusy ? lastEventAgeMs() : undefined}
        displayMode={state.displayMode}
        awaitingPermission={!!toolPermissionPrompt || !!batchAuthPrompt || (!!skillDraft && !batchAuthPrompt && !toolPermissionPrompt)}
      />

      <MemoryToastStack
        toasts={state.memoryToasts}
        onRevert={revertMemoryToast}
        onDismiss={dismissMemoryToast}
      />

      {batchAuthPrompt ? (
        <BatchAuthCard prompt={batchAuthPrompt} onDecide={resolveBatchAuth} />
      ) : toolPermissionPrompt ? (
        <ToolPermissionOverlay prompt={toolPermissionPrompt} onDecide={resolveToolPermission} />
      ) : null}

      {skillDraft && !batchAuthPrompt && !toolPermissionPrompt ? (
        <SkillSuggestionCard
          draft={skillDraft}
          skillsDir={skillsDir}
          bus={runtime.getBus()}
          onClose={(r) => void clearSkillDraft(r === 'dismiss' ? 'dismiss' : r === 'saved' ? 'saved' : 'ignored')}
        />
      ) : null}

      <PromptInput
        disabled={isBusy || (!!skillDraft && !batchAuthPrompt && !toolPermissionPrompt)}
        awaitingToolPermission={!!toolPermissionPrompt || !!batchAuthPrompt}
        onSubmit={handleSubmit}
        onCancel={cancel}
        history={state.inputHistory}
        commandEntries={commandEntries}
        onToggleDisplayMode={() => dispatch({ kind: 'toggleDisplayMode' })}
      />
    </Box>
  );
};
