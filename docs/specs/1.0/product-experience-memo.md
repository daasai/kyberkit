# 产品体验备忘：长程任务进度 · 观测 · 授权

> 来源：多轮对话中用户反馈与讨论整理，供迭代规划与 PR 引用。

## 1. 背景与目标用户

- **用户画像**：知识工作者；典型场景为长程数据分析、多步工具调用。
- **核心诉求**：在不过载的前提下，能回答三件事——**走到哪、还要多久、是否卡住**；同时保留可分析、可审计的数据。回合结束时还应能回答两件事——**给用户的结果是什么**、**执行过程如何串起来**（见 §4「收尾反馈」）。

## 2. 已落地能力（实现侧摘要）

- **事件与叙事**：`task_plan` / `task_narration`（Narrator 规则 + `plan_task` 工具 + PlanningHint）。
- **TUI**：MissionChip、ActivityPanel、StatusBar 节奏与静默等待提示；`v` 切换 compact/verbose；工具行折叠与同类错误合并展示思路。
- **no-TUI**：默认紧凑输出 + 心跳；`--verbose` / `--log-file`。
- **本地观测**：`.kyberkit/runtime/<agentId>.trajectory.sqlite`（turns / steps / trace_events）；`/stats`；`kyberkit trajectory export`；环境变量关闭或脱敏（见 README 与 `KYBER_TELEMETRY_TRAJECTORY_*`）。

## 3. 待解决问题（P0 / 体验硬伤）

| 项 | 描述 | 建议方向 |
|----|------|----------|
| 状态栏重叠 | 窄屏下 StatusBar 左侧长标题与中间指标同一行视觉重叠 | 左侧标题按终端宽度截断；或两行状态栏；避免把整段 userInput 塞进 `activeStepTitle` |
| 文案 | MissionChip 无 plan 时前缀「任务」语义偏弱 | 改为「当前正在执行的任务」或更短「进行中」；空输入占位同步 |

## 4. 待规划改进（P1 / 效率与安全平衡）

| 项 | 描述 | 建议方向 |
|----|------|----------|
| 收尾反馈 | 任务执行完成后，除模型正文外，缺少显式的「结果要点 + 执行过程」小结，用户难以快速核对交付物与步骤 | 系统提示词引导文末概括：（1）主要可交付物/结论；（2）关键步骤与所用工具及产出路径。产品侧可在 TUI / no-TUI 于 `turn_complete` 旁路生成**执行小结**（耗时、工具成败统计、近期 `task_narration` 摘要）；与 trajectory 数据对齐，避免与模型收尾重复时可折叠或二选一 |
| 授权频次 | `bash`/`python`/写操作等高频交互确认带来操作成本 | 风险分级；会话或任务级「记住允许」；批量一张卡确认；白名单路径 + 审计替代部分弹窗 |

## 5. 文档与实现对齐（低优先级）

- 设计文档中若仍写 `SqliteTrajectoryStore` / `TrajectoryMiddleware` 等命名，可与当前 `KyberAnalyticsDb` + `TrajectoryRecorder` 实现做一次索引更新，避免新同学迷路。

## 6. 建议排期

1. **本迭代**：重叠修复 + MissionChip 文案。
2. **下一迭代**：授权策略（分级 + 会话策略）；回合收尾小结（交付物 + 执行过程，见 §4「收尾反馈」）。
3. **按需**：基于 trajectory 的报表/看板（产品化消费）。

---

*备忘结束。*
