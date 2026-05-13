import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { formatDurationMs } from '../utils/format.js';

/**
 * IdentityBand — Sprint 3.5 §3.2 top band.
 *
 * Always visible. Answers "谁 / 在做什么 / 多久 / 在哪". Height fixed at one line
 * so the Narrative Band below can take the rest of the screen regardless of
 * activity state.
 */
export interface IdentityBandProps {
  /** Agent persona / name — typically loaded from KyberConfig.agent.name. */
  agentName: string;
  /** Short mission title (≤ ~48 chars). Empty → "待命". */
  mission: string;
  /** When the current turn / task started; drives the elapsed counter. */
  turnStartedAtMs?: number;
  /** Whether the agent is currently processing. */
  isBusy: boolean;
  /** Workspace identifier (e.g. "default"). Shown on the right for context. */
  workspaceId: string;
  /**
   * Sprint 3.5 §4.2 — permission mode label.
   * Sprint 3.5 Step 2 will populate this from PermissionPolicy; for now callers
   * pass "standard" or similar string literal.
   */
  permissionMode?: string;
  /** Asset counts for the "资产可感知" contract (Sprint 3.5 §6). */
  assetCounts?: { memories?: number; skills?: number };
  /** Bumps every ~1s so elapsed re-renders without extra props. */
  uiClockTick?: number;
}

export const IdentityBand: React.FC<IdentityBandProps> = ({
  agentName,
  mission,
  turnStartedAtMs,
  isBusy,
  workspaceId,
  permissionMode,
  assetCounts,
  uiClockTick,
}) => {
  void uiClockTick;

  const elapsed =
    isBusy && turnStartedAtMs != null
      ? formatDurationMs(Math.max(0, Date.now() - turnStartedAtMs))
      : null;

  const missionDisplay = mission.trim().length > 0 ? mission : isBusy ? '进行中' : '待命';

  const rightBits: string[] = [];
  if (permissionMode) rightBits.push(`权限:${permissionMode}`);
  if (assetCounts?.memories != null) rightBits.push(`记忆 ${assetCounts.memories}`);
  if (assetCounts?.skills != null) rightBits.push(`技能 ${assetCounts.skills}`);
  rightBits.push(`ws:${workspaceId}`);

  return (
    <Box
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderBottom
      paddingX={1}
    >
      <Box width="100%" justifyContent="space-between">
        <Box flexGrow={1} flexShrink={1}>
          <Text color="cyan" bold>
            ◆ {agentName}
          </Text>
          <Text dimColor> · </Text>
          {isBusy ? (
            <Text color="yellow">
              <Spinner type="dots" />
              {' '}
            </Text>
          ) : null}
          <Text bold>{missionDisplay}</Text>
          {elapsed ? (
            <>
              <Text dimColor> · </Text>
              <Text dimColor>{elapsed}</Text>
            </>
          ) : null}
        </Box>

        <Box flexShrink={0}>
          <Text dimColor>{rightBits.join(' · ')}</Text>
        </Box>
      </Box>
    </Box>
  );
};
