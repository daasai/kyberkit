import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';

const DEFAULT_KK_MD_TEMPLATE = `# Identity: Kevin (Professional Assistant & Business Expert)

You are Kevin, an efficient and professional digital assistant.
Prioritize clear reasoning, execution quality, and measurable outcomes.
`;

const DEFAULT_MEMORY_TEMPLATE = `---
title: Kevin Profile
category: user
tags:
  - profile
  - default
source: manual
---

The assistant should operate as Kevin with professional and efficient communication.
`;

const DEFAULT_SKILL_TEMPLATE = `---
name: "workspace_example"
description: "A placeholder skill for workspace bootstrap verification"
---

# Instructions
This skill file verifies skill asset discovery in the default workspace.
`;

const DEFAULT_COMMAND_TEMPLATE = `# Workspace Command Placeholder

This file exists to verify command asset scanning for the workspace bootstrap.
`;

export interface WorkspacePathInfo {
  spacesRoot: string;
  userName: string;
  workspaceId: string;
  userRoot: string;
  workspaceRoot: string;
  projectRoot: string;
}

export interface WorkspaceSeedResult {
  userRoot: string;
  createdFiles: string[];
}

export function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^\w.-]/g, '_');
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveWorkspacePaths(options: {
  cwd?: string;
  userName?: string;
  workspaceId?: string;
  spacesRoot?: string;
}): WorkspacePathInfo {
  const cwd = options.cwd ?? process.cwd();
  const userName = sanitizePathSegment(options.userName ?? 'default', 'default');
  const workspaceId = sanitizePathSegment(options.workspaceId ?? 'default', 'default');
  const spacesRootRaw = options.spacesRoot ?? join(cwd, 'spaces');
  const spacesRoot = isAbsolute(spacesRootRaw) ? spacesRootRaw : resolve(cwd, spacesRootRaw);

  return {
    spacesRoot,
    userName,
    workspaceId,
    userRoot: join(spacesRoot, userName),
    workspaceRoot: join(spacesRoot, userName, 'workspaces', workspaceId),
    projectRoot: join(cwd, '.kyberkit'),
  };
}

export async function ensureWorkspaceSeed(options: {
  userRoot: string;
  projectKKPath?: string;
}): Promise<WorkspaceSeedResult> {
  const createdFiles: string[] = [];
  const { userRoot, projectKKPath } = options;

  await mkdir(userRoot, { recursive: true });
  await mkdir(join(userRoot, 'memories'), { recursive: true });
  await mkdir(join(userRoot, 'skills', 'example'), { recursive: true });
  await mkdir(join(userRoot, 'commands'), { recursive: true });
  await mkdir(join(userRoot, 'workspaces'), { recursive: true });

  const kkPath = join(userRoot, 'KK.md');
  if (!existsSync(kkPath)) {
    let kkContent = DEFAULT_KK_MD_TEMPLATE;
    if (projectKKPath && existsSync(projectKKPath)) {
      const source = await readFile(projectKKPath, 'utf-8');
      if (source.trim().length > 0) {
        kkContent = source;
      }
    }
    await writeFile(kkPath, kkContent, 'utf-8');
    createdFiles.push(kkPath);
  }

  const memoryPath = join(userRoot, 'memories', 'profile.md');
  if (!existsSync(memoryPath)) {
    await writeFile(memoryPath, DEFAULT_MEMORY_TEMPLATE, 'utf-8');
    createdFiles.push(memoryPath);
  }

  const skillPath = join(userRoot, 'skills', 'example', 'SKILL.md');
  if (!existsSync(skillPath)) {
    await writeFile(skillPath, DEFAULT_SKILL_TEMPLATE, 'utf-8');
    createdFiles.push(skillPath);
  }

  const commandPath = join(userRoot, 'commands', 'README.md');
  if (!existsSync(commandPath)) {
    await writeFile(commandPath, DEFAULT_COMMAND_TEMPLATE, 'utf-8');
    createdFiles.push(commandPath);
  }

  return { userRoot, createdFiles };
}
