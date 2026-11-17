import { test, expect } from '@playwright/test';
import type { User } from '../../src/types/domain';

test('旧会话刷新后显示完整数字UID，九位编号与窄屏均不截断', async ({ page }) => {
  const user: User = {
    id: '100000000',
    storage_owner_key: 'legacy-user-id',
    uid: '100000000',
    nickname: '数字编号用户',
    status: 'ACTIVE',
    remaining_interviews: 3,
    created_at: '2026-01-01T00:00:00Z',
  };
  await page.addInitScript((user) => {
    sessionStorage.setItem(
      'interview-session',
      JSON.stringify({
        state: { token: 'fixture', user: { ...user, id: 'legacy-user-id', uid: undefined }, mode: 'live' },
        version: 0,
      }),
    );
  }, user);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/users/me')
      ? user
      : path.endsWith('/consents')
        ? { policy_version: '1.0', items: [] }
        : { items: [], total: 0, page: 1, page_size: 20 };
    await route.fulfill({ json: { code: 'OK', message: 'success', data, request_id: 'uid-fixture' } });
  });
  await page.goto('/profile');
  await expect(page.getByLabel('用户 UID', { exact: true })).toHaveText('UID 100000000');
  await page.reload();
  await expect(page.getByLabel('用户 UID', { exact: true })).toHaveText('UID 100000000');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('用户 UID', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const stored = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('interview-session')!).state.user,
  );
  expect(stored.id).toBe('100000000');
  expect(stored.storage_owner_key).toBe('legacy-user-id');
  expect(stored.uid).toBe('100000000');
});
