import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const CONFIG_TEMPLATE = `version: "0.1"

model:
  provider: "anthropic"
  name: "claude-sonnet-4-20250514"
  # apiKey: "\${ANTHROPIC_API_KEY}" # Uncomment and set via env

permissions:
  allowed:
    - "read_fs"
    - "exec_shell"
    - "read_env"
  allowedPaths:
    - "./"

mcp:
  servers: []

skills:
  paths:
    - "./skills"

agent:
  name: "default-agent"
  systemPrompt: "You are a helpful KyberKit agent."
`;

const AGENTS_MD_TEMPLATE = `# Agents

Default agent prompts and instructions go here.
`;

const AGENT_TS_TEMPLATE = `import { KyberRuntime } from 'kyberkit';

async function main() {
  const runtime = new KyberRuntime();
  await runtime.bootstrap('kyberkit.config.yaml');
  
  const agent = runtime.createAgent();
  
  console.log('Agent initialized with ID:', agent.id);
  
  // Example of starting the agent loop:
  // await runtime.runAgent(agent);
}

main().catch(console.error);
`;

const SKILL_EXAMPLE_TEMPLATE = `---
name: "hello_world"
description: "A simple hello world skill"
---

# Instructions
When asked to say hello, reply with: "Hello from KyberKit Skill!"
`;

const PACKAGE_JSON_TEMPLATE = (name: string) => `{
  "name": "${name}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/agent.ts"
  },
  "dependencies": {
    "kyberkit": "workspace:*"
  }
}
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
`;

const ENV_EXAMPLE_TEMPLATE = `ANTHROPIC_API_KEY=your_key_here
`;

export async function initProject(projectName: string): Promise<void> {
  const root = join(process.cwd(), projectName);

  // Create directory structure
  await mkdir(join(root, 'src', 'tools'), { recursive: true });
  await mkdir(join(root, 'src', 'prompts'), { recursive: true });
  await mkdir(join(root, 'skills', 'example'), { recursive: true });
  await mkdir(join(root, 'mcp'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });

  // Create templates
  await writeFile(join(root, 'kyberkit.config.yaml'), CONFIG_TEMPLATE);
  await writeFile(join(root, 'AGENTS.md'), AGENTS_MD_TEMPLATE);
  await writeFile(join(root, 'src', 'agent.ts'), AGENT_TS_TEMPLATE);
  await writeFile(join(root, 'skills', 'example', 'SKILL.md'), SKILL_EXAMPLE_TEMPLATE);
  await writeFile(join(root, 'package.json'), PACKAGE_JSON_TEMPLATE(projectName));
  await writeFile(join(root, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  await writeFile(join(root, '.env.example'), ENV_EXAMPLE_TEMPLATE);

  console.log(`\n✓ Project "${projectName}" created at ${root}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  bun install`);
  console.log(`  cp .env.example .env`);
  console.log(`  bun run src/agent.ts\n`);
}
