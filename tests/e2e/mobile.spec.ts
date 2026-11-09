import { test, expect, devices, type Page } from '@playwright/test';
import { defaultConfig } from '../../src/features/interviews/schema';
import type { Interview, User } from '../../src/types/domain';

async function demoLogin(page: Page) {
  await page.goto('/login');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    })),
  ).toEqual({ width: (await page.viewportSize())!.width, viewport: (await page.viewportSize())!.width });
}

test.describe('H5 手机浏览器', () => {
  const { defaultBrowserType: _browser, ...phone } = devices['iPhone 13'];
  test.use(phone);
  test.beforeEach(async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', (route) =>
      route.fulfill({
        json: [
          {
            sn: '2',
            name: '专业技术人员',
            subclass: [
              {
                sn: '2-02',
                name: '工程技术人员',
                subclass: [
                  {
                    sn: '2-02-10',
                    name: '软件技术',
                    subclass: [
                      { sn: '2-02-10-01', name: '软件工程技术人员', desc: '负责软件设计、开发与测试。' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });

  test('小屏岗位目录逐级选择、确认与关闭后恢复焦点', async ({ page }) => {
    await demoLogin(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/interviews/new');
    const picker = page.getByRole('button', { name: '搜索并选择目标岗位' });
    await picker.click();
    await page
      .getByRole('navigation', { name: '一级行业' })
      .getByRole('button', { name: '专业技术人员', exact: true })
      .click();
    await page
      .getByRole('navigation', { name: '二级岗位类目' })
      .getByRole('button', { name: '工程技术人员', exact: true })
      .click();
    await page.getByRole('button', { name: /软件工程技术人员.*负责软件设计/ }).click();
    await noOverflow(page);
    await page.screenshot({ path: 'test-results/h5-job-picker.png', fullPage: true });
    await page.getByRole('button', { name: '确认选择', exact: true }).click();
    await expect(page.locator('.job-picker-trigger')).toHaveText('软件工程技术人员');
    await expect(page.getByLabel('岗位描述 JD')).toHaveValue(/负责软件设计/);
    await page.locator('.job-picker-trigger').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.job-picker-trigger')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('输入时视口收缩隐藏底栏，恢复高度后重新显示', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/interviews/new');
    await page.getByLabel('岗位描述 JD').focus();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeHidden();
    await expect(page.locator('.form-actions')).toHaveCSS('position', 'static');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeVisible();
    await noOverflow(page);
  });

  test('手机完整文字面试、刷新恢复、卡片记录、购买权益及导航', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await demoLogin(page);
    await expect(page.locator('html')).toHaveAttribute('data-device', 'phone');
    const tabs = page.getByRole('navigation', { name: '手机主导航' });
    await expect(tabs).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: 'test-results/h5-dashboard.png', fullPage: true });
    await tabs.getByRole('link', { name: '开始面试', exact: true }).click();
    await page.getByRole('button', { name: '搜索并选择目标岗位' }).click();
    await expect(page.getByRole('dialog', { name: '选择目标岗位' })).toBeVisible();
    await noOverflow(page);
    await page.getByPlaceholder('搜索岗位名称或职责关键词').fill('前端工程师');
    await page.getByRole('button', { name: '使用自定义岗位' }).click();
    await page.getByLabel('岗位描述 JD').fill('负责 React 组件架构设计，优化性能；协作落地复杂项目。');
    await page.getByLabel('主问题数量').fill('1');
    await page.getByLabel('允许 AI 动态追问').uncheck();
    await expect(page.locator('.mobile-plan-summary')).toContainText('1 道题');
    await page.getByRole('checkbox', { name: /我同意使用以上岗位/ }).check();
    await page.screenshot({ path: 'test-results/h5-create.png', fullPage: true });
    await page.getByRole('button', { name: '创建专属面试', exact: true }).click();
    await page.getByRole('button', { name: '正式开始面试' }).click();
    await expect(tabs).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('textbox', { name: '你的面试回答' })).toBeVisible();
    await noOverflow(page);
    await page.getByRole('button', { name: '暂停面试', exact: true }).click();
    await expect(page.getByRole('heading', { name: '稍作休息，也是一种准备' })).toBeVisible();
    await page.getByRole('button', { name: '继续面试', exact: true }).first().click();
    await page
      .getByRole('textbox', { name: '你的面试回答' })
      .fill(
        '我负责业务组件拆分，定义 props 和交互边界。我梳理重复逻辑，拆分可复用组件，补充文档，并通过性能测试和团队评审验证改进。',
      );
    await page.screenshot({ path: 'test-results/h5-room.png', fullPage: true });
    await page.getByRole('button', { name: '提交回答', exact: true }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByRole('heading', { name: /每一次复盘/ })).toBeVisible();
    await page.getByRole('button', { name: /01.*React/ }).click();
    await expect(page.getByText('你的回答原文')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: 'test-results/h5-report.png', fullPage: true });
    await tabs.getByRole('link', { name: '记录', exact: true }).click();
    await expect(page.locator('.interview-record')).toHaveCount(1);
    await expect(page.locator('.table-date')).toBeVisible();
    await expect(page.getByRole('button', { name: '删除 前端工程师 面试' })).toBeVisible();
    await page.getByLabel('搜索面试岗位').fill('不存在的岗位');
    await expect(page.getByText('暂时没有符合条件的记录')).toBeVisible();
    await page.getByLabel('搜索面试岗位').fill('前端');
    await expect(page.locator('.interview-record')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: 'test-results/h5-history.png', fullPage: true });
    await page.getByRole('button', { name: '删除 前端工程师 面试' }).click();
    await page.getByRole('button', { name: '保留记录', exact: true }).click();
    await expect(page.locator('.interview-record')).toHaveCount(1);
    await page.getByRole('button', { name: '删除 前端工程师 面试' }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.locator('.interview-record')).toHaveCount(0);
    await tabs.getByRole('link', { name: '权益', exact: true }).click();
    await page.getByRole('button', { name: '购买 10 次权益', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page);
    await page.getByRole('button', { name: /^确认购买 · 模拟支付/ }).click();
    await expect(page.getByRole('dialog', { name: '权益购买成功' })).toBeVisible();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await tabs.getByRole('link', { name: '我的', exact: true }).click();
    await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '打开导航' }).click();
    await expect(page.getByRole('dialog', { name: '导航菜单' })).toBeVisible();
    await page.getByRole('link', { name: '邀请好友', exact: true }).click();
    await expect(page.getByRole('heading', { name: /邀请好友/ })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(errors).toEqual([]);
  });

  test('小屏、横屏与所有主要页面无横向溢出，手机保持 H5', async ({ page }) => {
    await demoLogin(page);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 412, height: 915 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      for (const path of [
        '/dashboard',
        '/interviews/new',
        '/history',
        '/profile',
        '/billing',
        '/invitations',
      ]) {
        await page.goto(path);
        await expect(page.locator('#main-content h1')).toBeVisible();
        await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeVisible();
        await noOverflow(page);
      }
    }
    await page.evaluate(() => sessionStorage.removeItem('interview-session'));
    await page.goto('/register');
    await expect(page.getByRole('tab', { name: '注册账号' })).toHaveAttribute('aria-selected', 'true');
    await noOverflow(page);
  });

  for (const mode of ['VOICE', 'VIDEO'] as const) {
    test(`${mode} 手机面试室保留授权、字幕、场景和操作`, async ({ page }) => {
      const user: User = {
        id: 'h5-media',
        nickname: '手机验证',
        status: 'ACTIVE',
        remaining_interviews: 3,
        created_at: new Date().toISOString(),
      };
      const item: Interview = {
        id: 'h5-room',
        job_profile_id: 'job',
        job_title: '手机音视频测试',
        mode,
        config: { ...defaultConfig, mode },
        status: 'READY',
        resume_asset_id: null,
        current_turn_no: 1,
        elapsed_seconds: 0,
        created_at: user.created_at,
        started_at: null,
        ended_at: null,
        current_question: {
          id: 'turn',
          turn_no: 1,
          main_index: 0,
          turn_type: 'MAIN',
          parent_turn_id: null,
          competency: '专业深度',
          question: '请介绍你参与的项目。',
          status: 'WAITING_ANSWER',
          transcript: null,
          task_id: null,
          question_audio: null,
          answer_media: null,
        },
        prepare_task_id: null,
        report_task_id: null,
        overall_score: null,
        failure_code: null,
        version: 1,
      };
      await page.addInitScript(
        (user) =>
          sessionStorage.setItem(
            'interview-session',
            JSON.stringify({ state: { token: 'fixture', user, mode: 'live' }, version: 0 }),
          ),
        user,
      );
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const data = path.endsWith('/users/me')
          ? user
          : path.endsWith('/interviews/h5-room')
            ? item
            : { items: [], total: 0 };
        await route.fulfill({ json: { code: 'OK', data, message: 'success', request_id: 'h5-fixture' } });
      });
      await page.goto('/interviews/h5-room/room');
      await expect(page.getByRole('button', { name: '开始面试并全程录制' })).toBeDisabled();
      await page.getByRole('checkbox', { name: /我同意全程录制/ }).check();
      await expect(page.getByRole('button', { name: '开始面试并全程录制' })).toBeEnabled();
      await expect(page.getByRole('log', { name: '实时字幕' })).toBeVisible();
      if (mode === 'VIDEO') await expect(page.locator('.interview-scene canvas')).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: `test-results/h5-${mode.toLowerCase()}.png`, fullPage: true });
    });
  }

  test('邀请页面在窄屏展示长邮箱、邀请奖励及完整链接', async ({ page }) => {
    const now = new Date().toISOString();
    const user: User = {
      id: 'h5-invite',
      nickname: '手机邀请',
      status: 'ACTIVE',
      remaining_interviews: 3,
      created_at: now,
    };
    await page.addInitScript(
      (user) =>
        sessionStorage.setItem(
          'interview-session',
          JSON.stringify({ state: { token: 'fixture', user, mode: 'live' }, version: 0 }),
        ),
      user,
    );
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith('/users/me')
        ? user
        : {
            code: 'H5FRIEND',
            url: 'https://interview.example/register?invite=H5FRIEND',
            valid_invites: 2,
            current_rule_invites: 2,
            reward_count: 1,
            next_reward_in: 1,
            rules: {
              enabled: true,
              threshold: 3,
              inviter_rewards: { TEXT: 1, VOICE: 1, VIDEO: 1 },
              invitee_rewards: { TEXT: 1, VOICE: 0, VIDEO: 0 },
            },
            reward_records: [
              {
                id: 'reward',
                usage_type: 'INVITER_REWARD',
                created_at: now,
                credit_allocations: { TEXT: 1, VOICE: 1, VIDEO: 1 },
              },
            ],
            recent: [
              {
                id: 'friend',
                nickname: '准备下一场面试的好友',
                email: 'a-very-long-mobile-email-address@example.com',
                registered_at: now,
                status: 'ACTIVE',
              },
            ],
          };
      await route.fulfill({ json: { code: 'OK', data, message: 'success', request_id: 'invite-fixture' } });
    });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/invitations');
    await expect(page.getByRole('heading', { name: 'H5FRIEND' })).toBeVisible();
    await expect(page.getByLabel('专属邀请链接')).toHaveValue(/invite=H5FRIEND/);
    await expect(page.locator('.invitation-friend-row')).toContainText(
      'a-very-long-mobile-email-address@example.com',
    );
    await noOverflow(page);
    await page.screenshot({ path: 'test-results/h5-invitations.png', fullPage: true });
  });
});

test.describe('Android 手机', () => {
  const { defaultBrowserType: _browser, ...phone } = devices['Pixel 7'];
  test.use(phone);
  test('自动进入 H5，横屏继续显示手机导航', async ({ page }) => {
    await demoLogin(page);
    await expect(page.locator('html')).toHaveAttribute('data-device', 'phone');
    await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeVisible();
    await page.setViewportSize({ width: 915, height: 412 });
    await noOverflow(page);
    await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeVisible();
  });
});

for (const device of ['Desktop Chrome', 'iPad Mini'] as const) {
  test.describe(`${device} 保留现有版本`, () => {
    const { defaultBrowserType: _browser, ...settings } = devices[device];
    test.use({ ...settings });
    test('不显示手机导航', async ({ page }) => {
      await demoLogin(page);
      await expect(page.locator('html')).toHaveAttribute('data-device', 'desktop');
      await expect(page.getByRole('navigation', { name: '手机主导航' })).toHaveCount(0);
      await expect(page.locator('.hero-art')).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/h5-regression-${device.replaceAll(' ', '-')}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('html')).toHaveAttribute('data-device', 'desktop');
      await expect(page.getByRole('navigation', { name: '手机主导航' })).toHaveCount(0);
    });
  });
}
