---
name: data_analysis
description: Business CSV / tabular data analysis and reporting
when_to_use: 分析 数据 报表 csv 支付 指标 趋势 洞察 业务
activation_paths:
  - "**/*.csv"
  - "**/*.xlsx"
  - "spaces/**/data/**"
allowed_tools:
  - read_file
  - python
  - bash
  - write_file
  - glob
  - grep
---

# 数据分析工作流

## 步骤

1. 用 `read_file` 读取前若干行了解列名与数据类型；大文件用 `offset`/`limit`。
2. 用 `python`（pandas）加载数据，做缺失值、类型、基本统计（describe）。
3. 按用户问题做分组、聚合、交叉分析（例如支付工具维度）。
4. 输出结构化结论：Markdown 表格 + 关键洞察 + 可执行建议。
5. 如需落盘，用 `write_file` 写到 `spaces/<workspace>/reports/` 或用户指定路径。

## 原则

- 先描述数据画像，再给出业务解读；数字需可复核。
- 不确定时向用户澄清，避免臆断。
- 优先用 `python` + pandas 处理 CSV，避免手工逐行推理。
