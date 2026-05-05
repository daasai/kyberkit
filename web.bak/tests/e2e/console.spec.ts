import { expect, test, type Page } from "@playwright/test";

async function dismissOverviewOnce(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("kyberkit.console.overview.dismissed", "1");
    localStorage.setItem("kyberkit.console.overview.dismissed:default", "1");
  });
}

test("sessions page renders run summary and preview flow", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/c");

  await expect(page.getByRole("heading", { name: /会话:/ })).toBeVisible();
  await expect(page.getByText("阶段:").first()).toBeVisible();
  await expect(page.getByText("SSE:")).toBeVisible();

  const artifact = page.locator("button", { hasText: "reports/" }).first();
  await expect(artifact).toBeVisible();
  await artifact.click();

  await expect(page.getByRole("heading", { name: /weekly-2026w18\.md|incident-preview\.html|city-metrics\.csv/ })).toBeVisible();
});

test("contracts page supports pause and resume round trip", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/settings/contracts");

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  const activeCard = page.locator("article", { hasText: " · active · " }).first();
  const pausedCard = page.locator("article", { hasText: " · paused · " }).first();

  const card = (await activeCard.count()) > 0 ? activeCard : pausedCard;
  await expect(card).toBeVisible();
  const taskId = (await card.locator(".text-sm.font-semibold").first().innerText()).trim();
  const stableCard = page.locator("article", { hasText: taskId }).first();

  await stableCard.getByRole("button", { name: "恢复" }).click();
  await expect(stableCard).toContainText(" · active · ");

  await stableCard.getByRole("button", { name: "暂停" }).click();
  await expect(page.locator("article", { hasText: taskId })).toHaveCount(0);

  await page.getByRole("button", { name: "已暂停" }).click();
  const pausedViewCard = page.locator("article", { hasText: taskId }).first();
  await expect(pausedViewCard).toContainText(" · paused · ");

  await pausedViewCard.getByRole("button", { name: "恢复" }).click();
  await expect(page.locator("article", { hasText: taskId })).toHaveCount(0);

  await page.getByRole("button", { name: "运行中" }).click();
  await expect(page.locator("article", { hasText: taskId }).first()).toContainText(" · active · ");
});

test("preferences page updates policy pack", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/settings/preferences");

  const select = page.locator("select").first();
  await expect(select).toBeVisible();
  const previous = await select.inputValue();

  const next = previous === "development" ? "balanced" : "development";
  await select.selectOption(next);
  await expect(select).toHaveValue(next);
});

test("sessions page supports send and cancel interactions", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/c");

  const input = page.getByPlaceholder("输入任务内容，支持审批流与普通执行。");
  await input.fill("生成一个普通执行结果");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("任务已执行完成，已生成可预览制品。")).toBeVisible();
  await page.getByRole("button", { name: "取消运行" }).click();
  await expect(page.getByText("运行已取消。")).toBeVisible();
});

test("sessions page supports approval actions", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/c");

  const input = page.getByPlaceholder("输入任务内容，支持审批流与普通执行。");
  await input.fill("请走审批流程发送告警");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByRole("button", { name: "Approve" }).first().click();

  await expect(page.getByText("已继续执行并产出结果。")).toBeVisible();
});

test("contracts page supports creating draft contract", async ({ page }) => {
  await dismissOverviewOnce(page);
  await page.goto("/settings/contracts");

  const taskId = `e2e_draft_${Date.now().toString().slice(-6)}`;
  await page.getByPlaceholder("taskId").fill(taskId);
  await page
    .getByPlaceholder("toolName:L1:false,another_tool:L2:true")
    .fill("write_file:L1:false,wecom.send_card:L2:true");
  await page.getByRole("button", { name: "新建" }).click();
  await page.getByRole("button", { name: "草稿" }).click();
  await expect(page.locator("article", { hasText: taskId }).first()).toBeVisible();
});
