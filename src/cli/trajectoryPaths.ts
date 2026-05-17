import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Align with sidecar `resolveTrajectoryDbPath()` — `traces.db` under trajectory dir. */
export function resolveTrajectoryDbPath(): string {
  const raw = process.env.KEVIN_TRAJECTORY_DIR?.trim();
  const dir = raw || join(homedir(), '.kevin', 'trajectory');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'traces.db');
}
