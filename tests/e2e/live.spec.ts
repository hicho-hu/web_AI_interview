import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
test.skip(!process.env.LIVE_API, '仅显式启用 LIVE_API 时使用运行中的 FastAPI');

test('真实后端请求：登录、用户信息、历史记录均通过 Vite 代理', async ({ page }) => {
  const responses: { method: string; path: string; status: number }[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) {
      responses.push({
        method: response.request().method(),
        path: `${url.pathname}${url.search}`,
        status: response.status(),
      });
    }
  });
  await page.goto('/login');
  await page.getByLabel('测试账号标识').fill(`web-connection-check-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('后端连接验证');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page.getByText('真实后端已连接', { exact: true })).toBeVisible();
  await expect
    .poll(() => responses.some((r) => r.path.startsWith('/api/v1/interviews?') && r.status === 200))
    .toBe(true);
  expect(
    responses.some((r) => r.method === 'POST' && r.path === '/api/v1/auth/dev-login' && r.status === 200),
  ).toBe(true);
  expect(responses.some((r) => r.path === '/api/v1/users/me' && r.status === 200)).toBe(true);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await writeFile('test-results/backend-requests.json', JSON.stringify(responses, null, 2));
  console.info('真实后端请求记录：', JSON.stringify(responses));
});

test('FastAPI：独立测试账号、授权、创建、文字回答、服务端恢复、真实报告', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('测试账号标识').fill(`web-e2e-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('接口验证用户');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page.getByRole('heading', { name: /接口验证用户/ })).toBeVisible();
  await page.getByRole('link', { name: '新建模拟面试' }).click();
  await page.getByLabel('岗位名称').fill('React 前端工程师 · 自动验证');
  await page
    .getByLabel('岗位描述 JD')
    .fill('负责 React 和 TypeScript 业务组件设计；分析页面加载性能；通过自动化测试保障交互质量。');
  await page.getByLabel('主问题数量').fill('1');
  await page.getByLabel('允许 AI 动态追问').uncheck();
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  await page.getByRole('button', { name: '创建专属面试' }).click();
  await page.getByRole('button', { name: '正式开始面试' }).click({ timeout: 90000 });
  await expect(page.getByRole('textbox', { name: '你的面试回答' })).toBeEnabled();
  await page.reload();
  await page
    .getByRole('textbox', { name: '你的面试回答' })
    .fill(
      '在我的项目中，我使用 React 和 TypeScript 设计业务组件。我先梳理边界与状态，拆分组件，定义类型，再用自动化交互测试验证关键路径，通过构建和回归检查确保交付质量。',
    );
  await page.getByRole('button', { name: '提交回答', exact: true }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 90000 });
  await expect(page.getByRole('heading', { name: '本次面试综合表现' })).toBeVisible({ timeout: 90000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: '本次面试综合表现' })).toBeVisible();
  await page.screenshot({ path: 'test-results/live-report.png', fullPage: true });
  await page.getByRole('link', { name: '个人中心', exact: true }).click();
  await page.getByLabel('你的称呼').fill('接口验证已完成');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('heading', { name: '接口验证已完成', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出数据', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^interview-data-.*\.json$/);
  await page.getByRole('link', { name: '面试记录', exact: true }).click();
  await page.getByRole('button', { name: '删除 React 前端工程师 · 自动验证 面试', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的下一次进步，从这里开始' })).toBeVisible();
  await page.getByRole('link', { name: '个人中心', exact: true }).click();
  await page.getByRole('button', { name: '申请删除', exact: true }).click();
  await page.getByPlaceholder('删除我的数据').fill('删除我的数据');
  await page.getByRole('button', { name: '确认永久删除', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect(errors).toEqual([]);
});
