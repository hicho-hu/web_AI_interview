import { test, expect } from '@playwright/test';

test('演示：创建 → 准备 → 回答 → 报告 → 历史复盘，支持刷新和移动端', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '新建模拟面试' }).click();
  await page.getByLabel('岗位名称').fill('前端工程师');
  await page.getByLabel('岗位描述 JD').fill('负责 React 组件架构设计，优化性能；协作落地复杂项目。');
  await page.getByLabel('主问题数量').fill('1');
  await page.getByLabel('允许 AI 动态追问').uncheck();
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  await page.getByRole('button', { name: '创建专属面试' }).click();
  await page.getByRole('button', { name: '正式开始面试' }).click();
  await expect(page.getByRole('heading', { name: /React 组件架构/ })).toBeVisible();
  await page.getByRole('button', { name: '暂停面试' }).click();
  await expect(page.getByRole('heading', { name: '稍作休息，也是一种准备' })).toBeVisible();
  await page.getByRole('button', { name: '继续面试' }).first().click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '你的面试回答' })).toBeVisible();
  await page.screenshot({ path: 'test-results/room-desktop.png', fullPage: true });
  await page
    .getByRole('textbox', { name: '你的面试回答' })
    .fill(
      '我负责业务组件拆分，定义 props 和交互边界。我先梳理重复逻辑，拆分可复用组件，补充文档，然后通过性能测试和团队评审验证改进。',
    );
  await page.getByRole('button', { name: '提交回答', exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole('heading', { name: /每一次复盘/ })).toBeVisible();
  await page.getByRole('button', { name: /01.*React/ }).click();
  await expect(page.getByText('你的回答原文')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/report-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '面试记录', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索面试岗位' }).fill('前端工程师');
  await expect(page.getByRole('link', { name: /前端工程师.*文字面试/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('link', { name: '个人中心', exact: true }).click();
  await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('受保护路由和未同意协议不能登录', async ({ page }) => {
  await page.goto('/interviews/new');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('button', { name: '体验文字面试演示' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('演示模式明确标识不连接后端，并可返回真实登录', async ({ page }) => {
  const businessRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) businessRequests.push(request.url());
  });
  await page.goto('/login');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page.getByText('本地演示 · 未连接后端', { exact: true })).toBeVisible();
  expect(businessRequests).toEqual([]);
  await page.getByRole('button', { name: '连接真实后端', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByLabel('测试账号标识')).toBeVisible();
  await expect(page.getByText('真实后端登录 · 面试记录保存到服务器')).toBeVisible();
});
