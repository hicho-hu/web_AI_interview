import { test, expect } from '@playwright/test';

test('开屏宣传视频可加载与播放，手机端完整显示', async ({ page, request }) => {
  const media = await request.get('/media/ai-interview-intro-v5.mp4', { headers: { Range: 'bytes=0-1023' } });
  expect(media.status()).toBe(206);
  expect(media.headers()['content-type']).toContain('video/mp4');
  await page.goto('/login');
  const video = page.getByLabel('AI面试官介绍视频', { exact: true });
  await expect(video).toBeVisible();
  const box = await video.boundingBox();
  expect(box!.y).toBeLessThan(220);
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((node) => (node as HTMLVideoElement).duration)).toBeCloseTo(37, 0);
  await video.click();
  await video.evaluate((node) => (node as HTMLVideoElement).play());
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((node) => (node as HTMLVideoElement).pause());
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(video).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('邮箱登录、注册与体验账号通过三个 Tab 切换', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('tab', { name: '邮箱登录', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('邮箱地址', { exact: true })).toBeVisible();
  await expect(page.getByLabel('测试账号标识')).toHaveCount(0);
  await page.getByRole('tab', { name: '注册账号', exact: true }).click();
  await expect(page.getByLabel('确认密码', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '体验账号', exact: true }).click();
  await expect(page.getByLabel('测试账号标识')).toBeVisible();
  await expect(page.getByLabel('邮箱地址', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('tab', { name: '邮箱登录', exact: true }).click();
  await expect(page.getByLabel('登录密码', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.getByLabel('AI面试官介绍视频').boundingBox())!.y).toBeLessThan(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/login-tabs-mobile.png', fullPage: true });
});
