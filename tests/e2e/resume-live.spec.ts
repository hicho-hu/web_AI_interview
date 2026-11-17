import { test, expect } from '@playwright/test';
test.skip(!process.env.RESUME_E2E, '使用隔离后端与合成简历运行');
const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sample = Buffer.from(
  'UEsDBBQAAAAIAKO0cV33S4B1wgAAAHYBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QuQ7CMAyGX6XKiqgRAwOiLMAKDLyAlbptRC7FLsfbk3INCBjt//gsLw7XSFxcnPVcqU4kzgFYd+SQyxDJZ6UJyaHkMbUQUR+xJZhOJjPQwQt5GcvQoZaLNTXYWyk2l7xmE3ylEllWxephHFiVwhit0ShZh5OvPyjjJ6HMybuHOxN5lA0KvhIG5TfgmdudKCVTU7HHJFt02QXnkGqog+5dTpb/a77cGZrGaHrnh7aYgiZm41tny7fi0PjX/XB/9/IGUEsDBBQAAAAIAKO0cV1hey9DiQAAAPIAAAALAAAAX3JlbHMvLnJlbHONzzsOAiEQBuCrEA6ws1pYGKCy2dZ4AQLDIy6PDBj19lJYrMbCcuaffH9GnHHVPZbcQqyNPdKam+Sh93oEaCZg0m0qFfNIXKGk+xjJQ9Xmqj3Cfp4PQFuDK7E12WIlp8XuOLs8K/5jF+eiwVMxt4S5/6j4uhiyJo9d8nshC/a9ngbLQQn4eFG9AFBLAwQUAAAACACjtHFd63yXbx4BAAARAgAAEQAAAHdvcmQvZG9jdW1lbnQueG1ssym3SslPLs1NzStRqMjNySu2KrdVyigpKbDS1y9OzkjNTSzWyy9IzQPKpeUX5SaWALlF6frl+UUpBUX5yanFxZl56bk5+kYGBmb6uYmZeUp2NuVWSfkplSC6AEQUgYgSu6fblz7ZO+f57v6nfW02+iAREFkEJgvQFRsZGJnoGRjqvmjf/GR3l8KzGfOfbdr8bGv3i/VTn83pfDlzwtPWNU/7dxA058WW+S+2LFYIqCzJyM9TcAzwVHg6qUfBtzI40Efhya7up10LX6zb92LdQmIcZAhyEJA21jM0Amqe+HRHG9kueta39Gn/4mcNy180732yZ8bTnmkENb5cuPP57HVEht/TCR3POia8WLfoae9UiEYsWvRhEaWPSAR2AFBLAQIUAxQAAAAIAKO0cV33S4B1wgAAAHYBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAo7RxXWF7L0OJAAAA8gAAAAsAAAAAAAAAAAAAAIAB8wAAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAo7RxXet8l28eAQAAEQIAABEAAAAAAAAAAAAAAIABpQEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAPICAAAAAA==',
  'base64',
);
const empty = Buffer.from(
  'UEsDBBQAAAAIAKO0cV33S4B1wgAAAHYBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QuQ7CMAyGX6XKiqgRAwOiLMAKDLyAlbptRC7FLsfbk3INCBjt//gsLw7XSFxcnPVcqU4kzgFYd+SQyxDJZ6UJyaHkMbUQUR+xJZhOJjPQwQt5GcvQoZaLNTXYWyk2l7xmE3ylEllWxephHFiVwhit0ShZh5OvPyjjJ6HMybuHOxN5lA0KvhIG5TfgmdudKCVTU7HHJFt02QXnkGqog+5dTpb/a77cGZrGaHrnh7aYgiZm41tny7fi0PjX/XB/9/IGUEsDBBQAAAAIAKO0cV1hey9DiQAAAPIAAAALAAAAX3JlbHMvLnJlbHONzzsOAiEQBuCrEA6ws1pYGKCy2dZ4AQLDIy6PDBj19lJYrMbCcuaffH9GnHHVPZbcQqyNPdKam+Sh93oEaCZg0m0qFfNIXKGk+xjJQ9Xmqj3Cfp4PQFuDK7E12WIlp8XuOLs8K/5jF+eiwVMxt4S5/6j4uhiyJo9d8nshC/a9ngbLQQn4eFG9AFBLAwQUAAAACACjtHFdkEBhHl0AAABxAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sTY0xDoAgDAC/YnyANQ4OBPkLAioJbQnFoL/XxcTtLjecbsqzOzFQ7S5MJKot/VFrVgDijoBWBs6B3rZxQVtfLTs0Lj4XdkEk0o4JpnGcAW2k3uimVva30fCDb2IeUEsBAhQDFAAAAAgAo7RxXfdLgHXCAAAAdgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACACjtHFdYXsvQ4kAAADyAAAACwAAAAAAAAAAAAAAgAHzAAAAX3JlbHMvLnJlbHNQSwECFAMUAAAACACjtHFdkEBhHl0AAABxAAAAEQAAAAAAAAAAAAAAgAGlAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAMQIAAAAA',
  'base64',
);
test('简历原文件名、成功列表、去重、单选、失败反馈与个人中心删除', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await expect(page).toHaveTitle(/AI面试官/);
  await page.getByRole('tab', { name: '体验账号', exact: true }).click();
  await page.getByLabel('测试账号标识').fill(`resume-browser-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('简历验收');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto('/profile');
  await page.locator('summary').filter({ hasText: '我的简历' }).click();
  const file = page.getByLabel('上传个人简历', { exact: true });
  await file.setInputFiles({ name: '候选人-后端工程师.docx', mimeType: mime, buffer: sample });
  await expect(page.locator('.resume-library-record')).toHaveCount(1);
  await expect(page.locator('.resume-library-record strong')).toHaveText('候选人-后端工程师.docx');
  await expect(page.locator('.resume-library-record')).toContainText('已就绪');
  await file.setInputFiles({ name: '候选人-后端工程师.docx', mimeType: mime, buffer: sample });
  await expect(page.getByText(/同名简历已存在，已复用已有记录/)).toBeVisible();
  await expect(page.locator('.resume-library-record')).toHaveCount(1);
  await file.setInputFiles({ name: '空白文档.docx', mimeType: mime, buffer: empty });
  await expect(page.getByRole('alert')).toContainText('未提取到可读文字');
  await expect(page.locator('.resume-library-record')).toHaveCount(1);
  await expect(page.locator('.resume-library-record')).not.toContainText('空白文档');
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
  );
  const listed = (
    await (await request.get('/api/v1/resumes', { headers: { Authorization: `Bearer ${token}` } })).json()
  ).data;
  expect(listed.total).toBe(1);
  expect(listed.items[0].filename).toBe('候选人-后端工程师.docx');
  await page.goto('/interviews/new');
  await expect(page.getByRole('radio', { name: '不使用简历', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: /候选人-后端工程师/ }).check();
  await page
    .getByLabel('上传个人简历', { exact: true })
    .setInputFiles({ name: '项目经验.docx', mimeType: mime, buffer: sample });
  await expect(page.getByRole('radio', { name: /项目经验/ })).toBeChecked();
  await expect(page.locator('input[name="interview-resume"]:checked')).toHaveCount(1);
  await page.getByRole('radio', { name: '不使用简历', exact: true }).check();
  await expect(page.locator('input[name="interview-resume"]:checked')).toHaveValue('');
  await page.getByRole('radio', { name: /候选人-后端工程师/ }).check();
  await page.getByLabel('岗位名称').fill('Python 后端工程师 · 简历验证');
  await page
    .getByLabel('岗位描述 JD')
    .fill('负责 Python API 服务开发，设计 MySQL 数据库与事务，优化并发性能。');
  await page.getByLabel('允许 AI 动态追问').uncheck();
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  const creation = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/v1/interviews' && r.method() === 'POST',
  );
  await page.getByRole('button', { name: '创建专属面试' }).click();
  expect((await creation).postDataJSON().resume_asset_id).toBe(listed.items[0].id);
  await page.getByRole('button', { name: '正式开始面试' }).click();
  await expect(page.getByRole('heading', { name: /最近两家公司/ })).toBeVisible();
  await page
    .getByRole('textbox', { name: '你的面试回答' })
    .fill(
      '我在最近两家公司负责 Python 接口和数据库开发。首先分析业务需求和执行计划，再优化索引与事务边界，通过压测、监控和代码评审验证结果并持续改进。',
    );
  await page.getByRole('button', { name: '提交回答', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '你的面试回答' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '你的面试回答' })).toBeEnabled();
  await page.getByRole('button', { name: '结束并生成报告', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '结束并生成报告', exact: true }).click();
  await expect(page).toHaveURL(/report$/);
  await expect(page.locator('.interview-closing')).toContainText('感谢您参加本次模拟面试');
  await page.goto('/profile');
  await page.locator('summary').filter({ hasText: '我的简历' }).click();
  await expect(page.locator('.resume-library-record')).toHaveCount(2);
  await page.getByRole('button', { name: '删除简历 项目经验.docx', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('.resume-library-record')).toHaveCount(1);
  await page.reload();
  await page.locator('summary').filter({ hasText: '我的简历' }).click();
  await expect(page.locator('.resume-library-record strong')).toHaveText('候选人-后端工程师.docx');
  expect(errors).toEqual([]);
});
