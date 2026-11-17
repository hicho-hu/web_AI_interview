import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('checkbox').check();
  await page.getByRole('tab', { name: '体验账号', exact: true }).click();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/interviews/new');
});

test('51job 职能逐级选择、跨分类去重、最多三项并保留已填写 JD', async ({ page }) => {
  const jd = '负责目标公司 Python 服务研发、接口性能优化及数据库事务设计。';
  await page.getByLabel('岗位描述 JD').fill(jd);
  await page.getByRole('button', { name: '从工作职能选择岗位', exact: true }).click();
  const first = page.getByRole('navigation', { name: '一级职能分类' });
  const second = page.getByRole('navigation', { name: '二级职能分类' });
  await expect(first.getByRole('button')).toHaveCount(27);
  await first.getByRole('button', { name: '互联网技术', exact: true }).click();
  await second.getByRole('button', { name: '后端开发', exact: true }).click();
  await page.getByRole('button', { name: '选择 Python', exact: true }).click();
  await page.getByRole('button', { name: '选择 java', exact: true }).click();
  await page.getByRole('button', { name: '选择 Golang', exact: true }).click();
  await page.getByRole('button', { name: '选择 Node.js', exact: true }).click();
  await expect(page.getByText('最多选择三个岗位', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 Node.js', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByLabel('已选岗位')).toContainText('已选 3/3');
  await page.getByRole('button', { name: '移除 java', exact: true }).click();
  await page.getByRole('button', { name: '选择 Node.js', exact: true }).click();
  await page.screenshot({ path: 'test-results/job-functions-desktop.png', fullPage: false });
  await page.getByRole('button', { name: '确认选择', exact: true }).click();
  await expect(page.getByLabel('岗位名称')).toHaveValue('Python、Golang、Node.js');
  await expect(page.getByLabel('岗位描述 JD')).toHaveValue(jd);
});

test('51job 全目录可离线筛选与搜索，末尾类别也能完整选择', async ({ page }) => {
  const external: string[] = [];
  await page.route(
    /https:\/\/.*(githubusercontent\.com|jsdelivr\.net|51jobcdn\.com|51job\.com)\//,
    (route) => {
      external.push(route.request().url());
      return route.abort();
    },
  );
  await page.getByRole('button', { name: '从工作职能选择岗位', exact: true }).click();
  await expect(page.locator('.job-picker-option[aria-pressed]')).toHaveCount(1058);
  await page
    .getByRole('navigation', { name: '一级职能分类' })
    .getByRole('button', { name: '政府机构/农业', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: '二级职能分类' })
    .getByRole('button', { name: '农林牧渔', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '选择 农业技术员', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: '一级职能分类' })
    .getByRole('button', { name: '全部职能', exact: true })
    .click();
  const search = page.getByRole('textbox', { name: '搜索岗位或工作职能' });
  await search.fill('pYtHoN');
  await expect(page.locator('.job-picker-option[aria-pressed]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '选择 Python', exact: true })).toBeVisible();
  await search.fill('完全不存在的职能12345');
  await expect(page.getByText('没有匹配的岗位，可以切换职能分类或使用自定义岗位。')).toBeVisible();
  await page.getByRole('button', { name: '使用自定义岗位', exact: true }).click();
  await expect(page.getByLabel('岗位名称')).toHaveValue('完全不存在的职能12345');
  expect(external).toEqual([]);
});

test('51job 同编码岗位跨分支共享选择状态且可以取消', async ({ page }) => {
  await page.getByRole('button', { name: '从工作职能选择岗位', exact: true }).click();
  await page
    .getByRole('navigation', { name: '一级职能分类' })
    .getByRole('button', { name: '互联网技术', exact: true })
    .click();
  const second = page.getByRole('navigation', { name: '二级职能分类' });
  await second.getByRole('button', { name: '运维/技术支持', exact: true }).click();
  await page.getByRole('button', { name: '选择 网络工程师', exact: true }).click();
  await second.getByRole('button', { name: '技术管理', exact: true }).click();
  const option = page.getByRole('button', { name: '选择 网络工程师', exact: true });
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await option.click();
  await expect(page.getByLabel('已选岗位')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认选择', exact: true })).toBeDisabled();
});
