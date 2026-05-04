import { test, expect } from '@playwright/test'

test.describe('Kevin web smoke', () => {
  test('loads home and receives sessions from Sidecar', async ({ page }) => {
    const sessionsReq = page.waitForResponse(
      (r) => r.url().includes('/sessions') && r.request().method() === 'GET' && !r.url().includes('/messages'),
    )
    await page.goto('/')
    await expect(page).toHaveTitle(/Kevin/)
    const res = await sessionsReq
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
    await expect(page.getByText('Kevin').first()).toBeVisible()
  })

  test('health is reachable (supports v0.3+ and legacy fields)', async ({ request }) => {
    const port = process.env.SIDECAR_PORT ?? '3001'
    const res = await request.get(`http://127.0.0.1:${port}/health`)
    expect(res.ok()).toBeTruthy()
    const j = (await res.json()) as Record<string, unknown>
    expect(j.status).toBe('ok')
    const count = j.sessionCount ?? j.sessions
    expect(typeof count === 'number').toBe(true)
    if (j.uptimeMs != null) expect(typeof j.uptimeMs).toBe('number')
  })
})
