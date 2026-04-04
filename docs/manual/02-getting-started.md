# 第 2 章：快速上手 —— 环境搭建与第一个 Agent

在本章中，我们将通过 KyberKit CLI 工具快速初始化一个项目，并运行您的第一个受控智能体。

## 2.1 环境准备

KyberKit 专为现代 JavaScript 运行时设计，推荐使用 **Bun** 以获得最佳的冷启动性能和开发体验。

- **运行时**：Bun >= 1.0.0 (推荐) 或 Node.js >= 18.0.0
- **包管理器**：Bun, npm 或 pnpm

### 检查环境
```bash
bun --version
# 或
node --version
```

## 2.2 项目初始化

KyberKit 提供了一键生成标准脚手架的指令。

### 创建新项目
```bash
# 使用 npx 或 bun x 运行 init 指令
bun x kyberkit init my-first-agent

cd my-first-agent
bun install
```

### 脚手架结构说明
初始化完成后，您的目录结构如下：
```text
my-first-agent/
├── kyberkit.config.yaml       # 核心配置文件 (权限、模型、工具)
├── AGENTS.md               # Agent 行为指南 (Prompt 仓库)
├── src/
│   └── agent.ts            # Agent 启动入口
├── skills/                 # L2 Skill 定义目录
│   └── example/
│       └── SKILL.md        # 示例 Skill
├── mcp/                    # MCP Server 配置
├── tsconfig.json
└── package.json
```

## 2.3 配置您的 Agent

打开 `kyberkit.config.yaml`。这是 Agent 的“基因蓝图”，定义了它能做什么以及拥有哪些权限。

```yaml
version: "0.1"

model:
  provider: "anthropic"
  name: "claude-3-5-sonnet-20240620"
  apiKey: "${ANTHROPIC_API_KEY}"

permissions:
  allowed:
    - "read_fs"      # 允许读取文件系统
    - "exec_shell"   # 允许执行 Shell 命令
    - "read_env"     # 允许读取环境变量
  allowedPaths:
    - "./"           # 限制文件访问范围

skills:
  paths:
    - "./skills"     # 加载本地 Skills
```

> [!IMPORTANT]
> 请确保在 `.env` 文件中设置了 `ANTHROPIC_API_KEY`，或在当前终端的环境变量中导出该 Key。

## 2.4 编写启动代码

查看 `src/agent.ts`。这就是启动 KyberKit 控制论底座的最小代码：

```typescript
import { KyberRuntime } from 'kyberkit';

async function main() {
  // 1. 初始化运行时并加载配置
  const runtime = new KyberRuntime();
  await runtime.bootstrap('kyberkit.config.yaml');
  
  // 2. 创建 Agent 实例
  const agent = runtime.createAgent();
  
  console.log('✓ Agent 实例已就绪，ID:', agent.id);
  
  // 3. 执行第一个任务
  // 注意：在完整版本中，您可以调用 runtime.runAgent(agent) 进入交互模式
  const result = await runtime.execute("请读取当前目录下的 README.md 并总结其核心内容");
  console.log('任务结果:', result);
}

main().catch(console.error);
```

## 2.5 运行 Agent

只需一条指令即可启动：

```bash
bun run src/agent.ts
```

如果一切正常，您将看到 KyberKit 运行时初始化日志。它会解析您的配置，建立模型连接，并按照权限约束开始执行任务。

---

恭喜！您已经成功运行了第一个基于 KyberKit 的 Agent。在下一章中，我们将深入其 **微内核 (Micro-Kernel)**，学习如何为 Agent 装备更强大的工具和技能。
