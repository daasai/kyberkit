# Architectural Specification: Project Split (Kyberkit & Claude-Code)

## 1. 目标与范围 (Goal & Scope)
当前在统一的 Repository 下，`kyberkit`（Agent 框架层）与 `claude-code`（CLI 应用层）共享了同级的 `package.json` 及 `tsconfig.json` 配置。为了避免循环依赖、类型边界模糊及环境污染，需要执行架构解耦（Decoupling），将二者转化为两个物理上独立、无任何依赖的顶级项目（Zero Dependency Projects）。

## 2. 目录重构拓扑 (Directory Realignment Topology)
系统边界将被切分为二。为了实现严格隔离，原有的 Git Root 将剥离应用层职责，转变为单纯的代码仓库容器。

### 重构前网络拓扑 (Before)
```text
Root (Shared package.json, tsconfig.json)
├── src/          # claude-code source
├── bin/          # claude-code binaries
└── packages/
    └── kyberkit/ # kyberkit source (relies on root node_modules)
```

### 重构后网络拓扑 (After - Target Desired State)
```text
Root (Only .git, .gitignore)
├── claude-code/   # 独立的 CLI 工程，承载原 root 的配置
│   ├── src/
│   ├── bin/
│   ├── package.json
│   └── tsconfig.json
└── kyberkit/      # 独立的 Agent Kernel 工程
    ├── src/
    ├── package.json
    └── tsconfig.json
```

## 3. 包管理边界定义 (Package Context Definition)

### 3.1 Kyberkit Context (Agent Kernel)
`kyberkit` 内部模块（如 `AnthropicProvider`, `KyberRuntime` 等）显式引入了外部依赖。
**Input (Dependencies required for resolution):**
- `@anthropic-ai/sdk`
- `@modelcontextprotocol/sdk`
- `zod`
- `zod-to-json-schema`
- Node 运行时 API（`fs/promises`, `path`, `os`, `child_process`）
- `yaml`

**Output Constraint:**
在初始化 `kyberkit/package.json` 时，以上依赖将被注册为 `dependencies`。
编译器配置 `kyberkit/tsconfig.json` 的 `compilerOptions.baseUrl` 将严格限定于其子目录范围内。由于是库项目，可能需要对外暴露 ESM 的 entry point。

### 3.2 Claude-Code Context (CLI Application)
原 Root 的 `package.json` 内容。
**Action Limit/Clean-up:**
- 从配置中剔除专属于 `kyberkit` 的模块声明（剔除不具备复用价值或纯粹被 `kyberkit` 占用的引用，如发现未使用的依赖进行清理）。
- 修正 `bin` 及其它 npm scripts 中的相对路径（由 `./bin` 转为 `./claude-code/bin` 等等，或直接在 `claude-code` 内执行），保持入口不变。

## 4. 回退策略与异常处理 (Fallback & Exception Handling)
- **Path Resolution Errors:** 转移过程中，由于 `import` 引用断裂可能导致文件或模块 `MODULE_NOT_FOUND` 异常抛出。因此在重构期间，需执行全局静态代码结构分析校验。
- **TypeScript Type Bleeding:** 分离后，需单独执行 `bun tsc --noEmit` 以拦截两方项目中可能存在的跨域类型污染（Type Cross-contamination / Type Bleeding）。必须断言该操作失败或拦截为0（All Passed）。

## 5. 阻断点协议 (Blocker Protocol / Action Required)
> 阻断点：本执行规范（Spec）及涉及整个目录迁移的 `Implementation Plan` 必须由 User 明确 Approve 之后方可进入 Phase 2/3 (TDD/Refactoring Execution)。请 User 确认是否采纳平行双目录拆分布局。
