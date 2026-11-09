import { test, expect } from '@playwright/test';

test.skip(!process.env.REGISTRATION_MOCK_E2E, '仅连接启用了注册邮件模拟的隔离后端');
test.use({ viewport: { width: 1440, height: 1080 } });

test('生产页面缺少 randomUUID 时可显示模拟验证码、验证注册并再次登录', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `registration-mock-${Date.now()}@example.com`;
  const password = 'Registration-mock-password-2026';
  let token = '';
  try {
    await page.goto('/register');
    await expect(page.getByRole('button', { name: '进入我的练习空间' })).toHaveCount(0);
    await page.getByLabel('邮箱地址', { exact: true }).fill(email);
    await page.getByLabel('登录密码', { exact: true }).fill(password);
    await page.getByLabel('确认密码', { exact: true }).fill(password);
    await page.getByRole('checkbox').check();
    const delivery = page.waitForResponse((response) => response.url().endsWith('/auth/email-code'));
    await page.getByRole('button', { name: '发送验证码', exact: true }).click();
    const response = await delivery;
    expect(response.ok()).toBe(true);
    const { data } = await response.json();
    expect(data.delivery).toBe('registration_mock');
    expect(data.mock_code).toMatch(/^\d{6}$/);
    expect(data.development_code).toBeUndefined();
    expect(response.request().headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.locator('.email-preview-note')).toContainText('注册测试模式');
    await expect(page.locator('.email-preview-note')).toContainText('未发送真实邮件，未验证邮箱归属');
    await expect(page.locator('.email-preview-note b')).toHaveText(data.mock_code);
    await page
      .getByLabel('邮箱验证码', { exact: true })
      .fill(data.mock_code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: '使用测试验证码注册', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('验证码错误');
    await page.getByLabel('邮箱验证码', { exact: true }).fill(data.mock_code);
    await page.getByRole('button', { name: '使用测试验证码注册', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    token = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
    );
    const me = await page.evaluate(async (token) => {
      const response = await fetch('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: response.status, body: await response.json() };
    }, token);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
    await page.getByRole('button', { name: '退出登录', exact: true }).last().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('邮箱地址', { exact: true }).fill(email);
    await page.getByLabel('登录密码', { exact: true }).fill(password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '使用邮箱登录', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
    token = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
    );
    expect(errors).toEqual([]);
  } finally {
    if (token && !page.isClosed()) {
      const status = await page.evaluate(async (token) => {
        const response = await fetch('/api/v1/users/me/data', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.status;
      }, token);
      expect(status).toBe(202);
    }
  }
});
