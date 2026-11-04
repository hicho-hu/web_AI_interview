import { test, expect, type Page } from '@playwright/test';
import { defaultConfig } from '../../src/features/interviews/schema';
import type { Interview, InterviewInput, Mode, ModeCredits, User } from '../../src/types/domain';

async function creationFixture(page: Page, initialCredits: number, remaining: number, typed?: ModeCredits) {
  const user: User = {
    id: 'creation-fixture',
    nickname: '创建面试验证',
    status: 'ACTIVE',
    remaining_interviews: initialCredits,
    ...(typed ? { interview_credits: typed, universal_interviews: 0 } : {}),
    created_at: new Date().toISOString(),
  };
  await page.addInitScript((user) => {
    sessionStorage.setItem(
      'interview-session',
      JSON.stringify({ state: { token: 'fixture', user, mode: 'live' }, version: 0 }),
    );
  }, user);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = {
    remaining,
    meRequests: 0,
    posts: [] as string[],
    interviews: [] as InterviewInput[],
    release,
  };
  const item: Interview = {
    id: 'created-interview',
    job_profile_id: 'created-job',
    job_title: '前端工程师',
    mode: 'TEXT',
    config: defaultConfig,
    status: 'READY',
    resume_asset_id: null,
    current_turn_no: 0,
    elapsed_seconds: 0,
    created_at: user.created_at,
    started_at: null,
    ended_at: null,
    current_question: null,
    prepare_task_id: null,
    report_task_id: null,
    overall_score: null,
    failure_code: null,
    version: 1,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'POST') state.posts.push(path);
    let data: unknown = {};
    if (path.endsWith('/users/me')) {
      state.meRequests++;
      data = { ...user, remaining_interviews: state.meRequests === 1 ? initialCredits : state.remaining };
    } else if (path.endsWith('/users/me/consents')) {
      data = request.method() === 'GET' ? { policy_version: '1.0', items: [] } : {};
    } else if (path.endsWith('/job-profiles')) {
      data =
        request.method() === 'POST'
          ? { ...request.postDataJSON(), id: 'created-job', status: 'READY' }
          : { items: [], total: 0, page: 1, page_size: 100 };
    } else if (path.endsWith('/job-profiles/created-job')) {
      data = { id: 'created-job', status: 'READY' };
    } else if (path.endsWith('/interviews') && request.method() === 'POST') {
      const input = request.postDataJSON() as InterviewInput;
      state.interviews.push(input);
      item.config = input.config;
      item.mode = input.config.mode;
      await gate;
      data = { interview_id: item.id, status: 'READY', task_id: null };
    } else if (path.endsWith(`/interviews/${item.id}`)) data = item;
    else if (path.endsWith('/turns') || path.endsWith('/media')) data = { items: [], total: 0 };
    await route.fulfill({ json: { code: 'OK', message: 'success', data, request_id: 'creation-fixture' } });
  });
  await page.goto('/interviews/new');
  await expect(page.locator('.summary-credits b')).toHaveText(String(initialCredits));
  await page.getByLabel('岗位名称').fill('前端工程师');
  await page.getByLabel('岗位描述 JD').fill('负责 React 和 TypeScript 组件开发及性能优化。');
  return state;
}

async function chooseMode(page: Page, mode: Mode) {
  if (mode !== 'TEXT')
    await page.getByRole('button', { name: mode === 'VIDEO' ? /视频面试/ : /语音面试/ }).click();
}

test('未授权时可点击创建，说明原因并定位授权；勾选后正常创建', async ({ page }) => {
  const state = await creationFixture(page, 2, 2);
  const create = page.getByRole('button', { name: '创建专属面试', exact: true });
  const agreement = page.getByRole('checkbox', { name: /我同意使用以上岗位/ });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('alert')).toContainText('请先确认授权');
  await expect(agreement).toBeFocused();
  expect(state.posts).toEqual([]);
  await agreement.check();
  await expect(page.getByRole('alert')).toHaveCount(0);
  state.release();
  await create.click();
  await expect(page).toHaveURL(/\/interviews\/created-interview\/room$/);
  expect(state.interviews).toHaveLength(1);
});

test('缓存额度为零仍能创建视频面试，重新核对额度且创建中禁止重复提交', async ({ page }) => {
  const state = await creationFixture(page, 0, 2);
  await chooseMode(page, 'VIDEO');
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  const create = page.getByRole('button', { name: '创建专属面试', exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  await expect.poll(() => state.interviews.length).toBe(1);
  await expect(page.getByRole('button', { name: '正在生成专属面试计划', exact: true })).toBeDisabled();
  await expect(page.locator('.summary-credits b')).toHaveText('2');
  expect(state.meRequests).toBe(2);
  expect(state.interviews[0].config.mode).toBe('VIDEO');
  state.release();
  await expect(page).toHaveURL(/\/interviews\/created-interview\/room$/);
});

test('服务端额度不足显示处理入口，额度恢复后原表单可重试创建语音面试', async ({ page }) => {
  const state = await creationFixture(page, 2, 0);
  await chooseMode(page, 'VOICE');
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  const create = page.getByRole('button', { name: '创建专属面试', exact: true });
  await create.click();
  await expect(page.getByRole('alert')).toContainText('当前可用练习次数不足');
  await expect(page.getByRole('link', { name: '查看面试记录', exact: true })).toBeVisible();
  await expect(page.locator('.summary-credits b')).toHaveText('0');
  await expect(create).toBeEnabled();
  expect(state.posts.some((path) => path.endsWith('/job-profiles') || path.endsWith('/interviews'))).toBe(
    false,
  );
  state.remaining = 1;
  state.release();
  await create.click();
  await expect(page).toHaveURL(/\/interviews\/created-interview\/room$/);
  expect(state.interviews).toHaveLength(1);
  expect(state.interviews[0].config.mode).toBe('VOICE');
  expect(state.meRequests).toBeGreaterThanOrEqual(3);
});

test('文字权益不能用于视频面试，切回有余额的类型后可正常创建', async ({ page }) => {
  const state = await creationFixture(page, 3, 3, { TEXT: 3, VOICE: 0, VIDEO: 0 });
  await chooseMode(page, 'VIDEO');
  await expect(page.locator('.summary-credits b')).toHaveText('0');
  await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
  await page.getByRole('button', { name: '创建专属面试', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('视频面试次数不足');
  expect(state.interviews).toHaveLength(0);
  await page.getByRole('button', { name: /文字面试/ }).click();
  await expect(page.locator('.summary-credits b')).toHaveText('3');
  state.release();
  await page.getByRole('button', { name: '创建专属面试', exact: true }).click();
  await expect(page).toHaveURL(/\/interviews\/created-interview\/room$/);
  expect(state.interviews[0].config.mode).toBe('TEXT');
});
