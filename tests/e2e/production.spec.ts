import { test, expect } from '@playwright/test';
test.skip(!process.env.PRODUCTION_PREVIEW, '仅验证已构建的生产产物');
test('生产构建保留已配置的体验登录，独立演示和路由分包可运行', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: '进入我的练习空间' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用邮箱登录', exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
  await page.getByRole('link', { name: '新建模拟面试' }).click();
  await expect(page.getByLabel('岗位描述 JD')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('岗位描述 JD')).toBeVisible();
  expect(errors).toEqual([]);
});
