import { expect, test } from '@playwright/test';

test.skip(!process.env.LIVE_API || !process.env.PRODUCTION_API, '仅使用隔离的 production 后端验证');

test('production 单 API：购买权益后可创建语音与视频面试，重复支付不重复发放', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('测试账号标识').fill(`production-flow-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('上线流程验证');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page.getByRole('heading', { name: /上线流程验证/ })).toBeVisible();
  await page.getByRole('link', { name: '我的权益', exact: true }).click();
  const buy = page.getByRole('button', { name: '购买 10 次权益', exact: true });
  await expect(buy).toBeEnabled();
  await buy.click();
  const payment = page.waitForResponse((response) =>
    /\/billing\/orders\/[^/]+\/dev-pay$/.test(new URL(response.url()).pathname) && response.status() === 200,
  );
  await page.getByRole('dialog').getByRole('button', { name: /确认购买.*模拟支付/ }).click();
  const order = (await (await payment).json()).data as { id: string };
  await expect(page.getByRole('dialog', { name: '权益购买成功' })).toBeVisible();

  for (const mode of ['VOICE', 'VIDEO'] as const) {
    await page.goto('/interviews/new');
    await page.getByLabel('岗位名称').fill(`生产验证 ${mode} 工程师`);
    await page.getByLabel('岗位描述 JD').fill('负责 Python API 开发、数据库事务设计和并发性能优化。');
    await page.getByRole('button', { name: mode === 'VOICE' ? /语音面试/ : /视频面试/ }).click();
    await page.getByLabel('主问题数量').fill('1');
    await page.getByLabel('允许 AI 动态追问').uncheck();
    await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
    await page.getByRole('button', { name: '创建专属面试', exact: true }).click();
    await expect(page).toHaveURL(/\/interviews\/[^/]+\/room$/, { timeout: 30000 });
    const id = new URL(page.url()).pathname.split('/')[2];
    const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string);
    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/interviews/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const interview = (await response.json()).data;
      expect(interview.mode).toBe(mode);
      return interview.status;
    }).toBe('READY');
  }
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string);
  const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'repeat-production-payment' };
  const duplicate = await page.request.post(`/api/v1/billing/orders/${order.id}/dev-pay`, { headers });
  expect(duplicate.ok()).toBe(true);
  const entitlement = (await (await page.request.get('/api/v1/billing/entitlements', { headers })).json()).data;
  expect(entitlement.remaining_interviews).toBe(11);
  expect(entitlement.reserved_interviews).toBe(2);
});
