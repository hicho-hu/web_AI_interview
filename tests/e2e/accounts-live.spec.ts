import { test, expect, type Page } from '@playwright/test';
import type { User } from '../../src/types/domain';

test.skip(!process.env.GROWTH_E2E, '仅在独立账号与推广验收实例运行');
const password = 'Email-browser-password-2026';
async function register(page: Page, email: string, query = '') {
  await page.goto(`/register${query}`);
  await page.getByLabel('邮箱地址', { exact: true }).fill(email);
  await page.getByLabel('登录密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByLabel('昵称').fill('邮箱注册练习');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const code = await page.locator('.email-preview-note b').textContent();
  await page.getByLabel('邮箱验证码', { exact: true }).fill(code!);
  await page.getByRole('button', { name: '验证邮箱并注册', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function headers(page: Page) {
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
  );
  return { Authorization: `Bearer ${token}` };
}

test('邮箱验证码注册、邀请奖励、头像昵称及邮箱密码修改可持续登录', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const inviter = (
    await (
      await request.post('/api/v1/auth/dev-login', { data: { identity: `email-inviter-${Date.now()}` } })
    ).json()
  ).data;
  const invitation = (
    await (
      await request.get('/api/v1/invitations/me', {
        headers: { Authorization: `Bearer ${inviter.access_token}` },
      })
    ).json()
  ).data;
  const email = `browser-${Date.now()}@example.com`;
  await register(page, email, `?invite=${invitation.code}`);
  let auth = await headers(page);
  const me = (await (await request.get('/api/v1/users/me', { headers: auth })).json()).data as User;
  expect(me.email).toBe(email);
  expect(me.interview_credits?.TEXT).toBe(1);
  await page.getByRole('link', { name: '邀请好友', exact: true }).click();
  await expect(page.getByLabel('专属邀请链接')).toHaveValue(/invite=/);
  await page.getByRole('link', { name: '个人中心', exact: true }).click();
  await page.getByLabel('你的称呼', { exact: true }).fill('新的邮箱昵称');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('称呼已更新', { exact: true })).toBeVisible();
  const avatar = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#416be3';
    ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(avatar, 'base64') });
  await expect(page.getByText('头像已更新', { exact: true })).toBeVisible();
  await expect(page.locator('.profile-identity img')).toBeVisible();
  await page.getByLabel('联系手机号', { exact: true }).fill('13800138000');
  await page.getByRole('button', { name: '保存联系信息', exact: true }).click();
  await expect(page.getByText('联系手机号已保存', { exact: true })).toBeVisible();
  const nextEmail = `changed-${Date.now()}@example.com`;
  await page.getByLabel('新邮箱地址', { exact: true }).fill(nextEmail);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const nextCode = await page.locator('.email-preview-note b').textContent();
  await page.getByLabel('绑定邮箱验证码', { exact: true }).fill(nextCode!);
  await page.getByLabel('确认当前密码', { exact: true }).fill('incorrect-current-password');
  await page.getByRole('button', { name: '验证并保存邮箱', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('当前密码不正确');
  await expect(page).toHaveURL(/\/profile$/);
  expect((await request.get('/api/v1/users/me', { headers: auth })).status()).toBe(200);
  await page.getByLabel('确认当前密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '验证并保存邮箱', exact: true }).click();
  await expect(page.getByText('邮箱已验证并保存，其他登录状态已失效', { exact: true })).toBeVisible();
  expect((await request.get('/api/v1/users/me', { headers: auth })).status()).toBe(401);
  auth = await headers(page);
  const changed = (await (await request.get('/api/v1/users/me', { headers: auth })).json()).data as User;
  expect(changed.email).toBe(nextEmail);
  expect(changed.nickname).toBe('新的邮箱昵称');
  expect(changed.contact_phone).toBe('13800138000');
  expect(changed.phone_verified).toBe(false);
  expect(changed.avatar_url).toBeTruthy();
  await page.getByLabel('原密码', { exact: true }).fill(password);
  await page.getByLabel('新密码', { exact: true }).fill('Updated-email-password-2026');
  await page.getByLabel('再次确认新密码', { exact: true }).fill('Updated-email-password-2026');
  await page.getByRole('button', { name: '保存新密码', exact: true }).click();
  await expect(page.getByText('密码已修改，其他登录状态已失效', { exact: true })).toBeVisible();
  expect((await request.get('/api/v1/users/me', { headers: auth })).status()).toBe(401);
  await page.getByRole('button', { name: '退出登录', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('邮箱地址', { exact: true }).fill(nextEmail);
  await page.getByLabel('登录密码', { exact: true }).fill('Updated-email-password-2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '使用邮箱登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('分佣链接注册归因，购买按原比例计提，重复回调及退款不重复分佣', async ({ page, request }) => {
  const admin = (
    await (
      await request.post('/api/v1/admin/auth/login', {
        data: { login_name: 'admin', password: 'Admin-e2e-password-2026' },
      })
    ).json()
  ).data;
  const adminHeaders = {
    Authorization: `Bearer ${admin.access_token}`,
    'Idempotency-Key': `promotion-${Date.now()}`,
  };
  const link = (
    await (
      await request.post('/api/v1/admin/promotions', {
        headers: adminHeaders,
        data: {
          name: 'Web端到端推广',
          promoter_name: '浏览器合作方',
          rate_bps: 2500,
          status: 'ACTIVE',
          reason: '验证注册购买分佣链路',
        },
      })
    ).json()
  ).data;
  await register(page, `promoted-${Date.now()}@example.com`, `?promotion=${link.code}`);
  const auth = await headers(page);
  await page.getByRole('link', { name: '我的权益', exact: true }).click();
  await page.getByRole('button', { name: '购买 1 次权益', exact: true }).click();
  await page.getByRole('button', { name: /^确认购买 · 模拟支付/ }).click();
  await expect(page.getByRole('dialog', { name: '权益购买成功' })).toBeVisible();
  const records = (
    await (
      await request.get('/api/v1/admin/promotions/commissions/records', { headers: adminHeaders })
    ).json()
  ).data.items;
  const commission = records.find((row: { link_id: string }) => row.link_id === link.id);
  expect(commission.amount_minor).toBe(247);
  expect(commission.rate_bps).toBe(2500);
  await request.post(`/api/v1/billing/orders/${commission.order_id}/dev-pay`, {
    headers: { ...auth, 'Idempotency-Key': 'repeat-payment' },
  });
  await request.post(`/api/v1/billing/orders/${commission.order_id}/refund`, {
    headers: { ...auth, 'Idempotency-Key': 'refund-payment' },
  });
  const after = (
    await (
      await request.get('/api/v1/admin/promotions/commissions/records', { headers: adminHeaders })
    ).json()
  ).data.items.filter((row: { link_id: string }) => row.link_id === link.id);
  expect(after).toHaveLength(1);
  expect(after[0].status).toBe('REVERSED');
});
