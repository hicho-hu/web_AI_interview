import { test, expect } from '@playwright/test';
import type { BillingOrder, Entitlements, User } from '../../src/types/domain';

test.skip(!process.env.LIVE_API, '显式启用 LIVE_API 后验证真实订单与权益接口');

test('FastAPI 权益购买：真实订单、模拟成功回调、权益持久化、重复回调和资源归属', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await page.getByLabel('测试账号标识').fill(`billing-e2e-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('权益购买验收');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page.getByText('真实后端已连接', { exact: true })).toBeVisible();
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
  );
  const headers = { Authorization: `Bearer ${token}` };
  let otherHeaders: { Authorization: string } | undefined;
  try {
    await page.getByRole('link', { name: '我的权益', exact: true }).click();
    const initialResponse = await request.get('/api/v1/billing/entitlements', { headers });
    expect(initialResponse.ok()).toBe(true);
    const before = (await initialResponse.json()).data as Entitlements;
    const packageCard = page
      .locator('.billing-product')
      .filter({ has: page.getByRole('button', { name: '购买 10 次权益', exact: true }) });
    await expect(packageCard).toBeVisible();
    await packageCard.getByRole('button').click();
    const orderResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/billing/orders' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^确认购买 · 模拟支付/ }).click();
    const created = await orderResponse;
    expect(created.ok()).toBe(true);
    const order = (await created.json()).data as BillingOrder;
    await expect(page.getByRole('dialog', { name: '权益购买成功' })).toBeVisible();
    await expect(page.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
    await expect(page.locator('.billing-balance-amount strong')).toHaveText(
      String(before.remaining_interviews + order.credits),
    );
    const duplicate = await request.post(`/api/v1/billing/orders/${order.id}/dev-pay`, {
      headers: { ...headers, 'Idempotency-Key': `duplicate-callback-${Date.now()}` },
      data: {},
    });
    expect(duplicate.ok()).toBe(true);
    expect((await duplicate.json()).data.status).toBe('PAID');
    const [balanceResponse, usageResponse] = await Promise.all([
      request.get('/api/v1/billing/entitlements', { headers }),
      request.get('/api/v1/billing/usage', { headers }),
    ]);
    const updated = (await balanceResponse.json()).data as Entitlements;
    expect(updated.remaining_interviews).toBe(before.remaining_interviews + order.credits);
    if (order.interview_credits) {
      for (const mode of ['TEXT', 'VOICE', 'VIDEO'] as const)
        expect(updated.interview_credits![mode]).toBe(
          (before.interview_credits?.[mode] ?? 0) + order.interview_credits[mode],
        );
      expect(updated.universal_interviews).toBe(before.universal_interviews);
    }
    const grants = (await usageResponse.json()).data.items.filter(
      (item: { usage_type: string; status: string }) =>
        item.usage_type === 'PURCHASE' && item.status === 'GRANTED',
    );
    expect(grants).toHaveLength(1);
    expect(grants[0].quantity).toBe(order.credits);
    if (order.interview_credits)
      expect(grants[0].credit_allocations).toEqual(
        Object.fromEntries(Object.entries(order.interview_credits).filter(([, quantity]) => quantity > 0)),
      );
    await page.reload();
    await expect(page.locator('.billing-balance-amount strong')).toHaveText(
      String(before.remaining_interviews + order.credits),
    );
    await expect(page.getByRole('region', { name: '购买记录' })).toContainText('购买成功');
    await page.screenshot({ path: 'test-results/billing-live.png', fullPage: true });

    const login = await request.post('/api/v1/auth/dev-login', {
      data: { identity: `billing-owner-check-${Date.now()}` },
    });
    expect(login.ok()).toBe(true);
    const other = (await login.json()).data as { access_token: string; user: User };
    otherHeaders = { Authorization: `Bearer ${other.access_token}` };
    for (const method of ['get', 'post'] as const) {
      const response =
        method === 'get'
          ? await request.get(`/api/v1/billing/orders/${order.id}`, { headers: otherHeaders })
          : await request.post(`/api/v1/billing/orders/${order.id}/dev-pay`, {
              headers: { ...otherHeaders, 'Idempotency-Key': 'wrong-owner' },
              data: {},
            });
      expect(response.status()).toBe(404);
    }
    const otherMe = await request.get('/api/v1/users/me', { headers: otherHeaders });
    expect((await otherMe.json()).data.remaining_interviews).toBe(other.user.remaining_interviews);
  } finally {
    // These uniquely named test accounts are the only data this test removes.
    await request.delete('/api/v1/users/me/data', { headers });
    if (otherHeaders) await request.delete('/api/v1/users/me/data', { headers: otherHeaders });
  }
});
