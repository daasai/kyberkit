# Track B 实现说明（联调与验收）

## 已交付文件（摘要）

| 能力 | 主要文件 |
|------|----------|
| ADR | `docs/decisions/0001-track-strategy-and-multitenancy-deferral.md` |
| Skill 建议 | `src/skills/SkillSuggestionRunner.ts`, `src/tui/components/SkillSuggestionCard.tsx` |
| 事件 | `src/types/events.ts`（`skill.*`, `permit.persistent_recorded`） |
| TurnSummary 资产 | `src/runtime/AgentSession.ts`（`gatherTaskAssets`） |
| BM25 | `src/memory/recall/Bm25LiteRecaller.ts` |
| Memory 组装 | `src/prompt/providers/MemoryProvider.ts` |
| 增长 | `src/observability/WorkspaceGrowthStore.ts` |
| Permits | `src/permission/PermitStore.ts`, `src/commands/builtin/PermitCommand.ts` |
| 批量持久 | `src/permission/ToolPermissionGate.ts`, `src/tui/components/BatchAuthCard.tsx` |

## 建议手动验收步骤

1. **Skill**：在一个回合内触发 ≥3 次工具调用，确认出现粉色技能卡片；`s` 保存后检查 `~/.kyberkit/skills/<slug>/SKILL.md`。
2. **TurnSummary**：触发记忆自动写入后，查看本轮 `TurnSummary` 是否出现记忆/技能/授权行（受 2s 窗口与异步时序影响）。
3. **BM25**：在 `memories/` 下放入多条 L3 文件后，用与某条强相关的自然语言提问，检查 system 中是否以「Long-term (recalled)」优先出现相关条。
4. **7d Banner**：新会话观察 `--` 后 `/assets` 与 Banner 的「近 7 天」行是否随操作递增。
5. **Permit**：`p` 持久批量授权或 `/permit add persistent bash L2`，确认 `~/.kyberkit/permit.yaml` 与重启后仍免审（在 L0–L2 策略下）。

## 为 Track A / C 预留的指标

- Skill 建议采纳率（`skill.adopted` / `skill.suggested`）
- 2s 窗口内 `turn_summary.assets` 非空率
- BM25 后 system prompt 字符量相对纯 `memoryContext` 的减少比例

这些可在未来接入 `trajectory` 或 `WorkspaceGrowthStore` 扩展表。
