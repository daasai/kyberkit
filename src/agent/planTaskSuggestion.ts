const PLAN_HINT_KEYWORDS =
  /分析|全部|遍历|对比|重构|数据|报告|report|csv|统计|聚合|目录|文件列表|深入|全面/i;

/** Heuristic: long or exploratory turns benefit from an explicit `plan_task` call. */
export function shouldSuggestPlanTask(userTurnText: string): boolean {
  const t = userTurnText.trim();
  if (t.length > 80) return true;
  return PLAN_HINT_KEYWORDS.test(t);
}
