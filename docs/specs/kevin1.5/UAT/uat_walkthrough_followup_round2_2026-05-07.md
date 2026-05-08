# Kevin v1.5 UAT 复测走查记录（Round 2）（2026-05-07）

> 目标：验证修复回归 + 记录新发现（Round 2 独立追踪）
> 状态约定：`new` / `triaged` / `fixed` / `verified` / `won't-fix`
> 分类约定：`v1.5-defect` / `v1.5-enhancement` / `out-of-scope`

## 问题清单

### UAT-R2-20260507-001

- 模块：Sidebar - Space 切换器
- 场景：Space 切换器菜单中的「管理 Space…」
- 问题描述：当前点击「管理 Space…」触发“在新窗口打开当前 Space”（`openSpaceInNewWindow(spaceId)`）。该行为不符合“管理”的语义与用户预期。
- 期望结果：点击应打开 **Space 管理弹窗**（同窗口），提供至少“查看 Space 列表 / 新建 / 重命名 / 删除 / 在新窗口打开（可选二级动作）”的管理能力与明确的危险操作提示。
- 实际结果：打开新窗口，无法进行 Space 管理操作。
- PRD 对照：`kevin-v1.5-prd-rev2.md` §7.E 定义底部为 Space 切换器（Vault 隐喻）；“管理”入口应属于同一语义域的管理能力，不应直接执行窗口跳转这种副作用动作。
- UX 评估：可理解性=低（管理≠打开）；一致性=低（动作与标签不匹配）；操作负担=中高（用户仍需另寻管理入口）。
- 判定分类：`v1.5-defect`
- 严重级别：S1（入口语义错误导致核心管理能力不可达）
- 优先级：P0
- 状态：`new`
- 备注：建议实现 `SpaceManagerModal`（前端）+ `POST /spaces` / `PATCH /spaces/:id` / `DELETE /spaces/:id`（Sidecar）最小闭环；“在新窗口打开”作为弹窗内二级按钮，复用 `openSpaceInNewWindow`。
