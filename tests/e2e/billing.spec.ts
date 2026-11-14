import { test, expect, type Page } from '@playwright/test';
import { demoCatalog } from '../../src/features/billing/demoCatalog';
import type { BillingOrder, ProductCatalog, User } from '../../src/types/domain';

type Scenario =
  | 'normal'
  | 'pending'
  | 'lost-payment'
  | 'lost-order'
  | 'price-change'
  | 'split-change'
  | 'disabled'
  | 'capability'
  | 'balance-error';
async function fixture(page: Page, scenario: Scenario) {
  const user: User = {
    id: 'billing-fixture',
    nickname: '权益购买验证',
    status: 'ACTIVE',
    remaining_interviews: 0,
    universal_interviews: 0,
    interview_credits: { TEXT: 0, VOICE: 0, VIDEO: 0 },
    created_at: new Date().toISOString(),
  };
  const catalog: ProductCatalog = structuredClone(demoCatalog);
  if (scenario === 'disabled') catalog.development_mock_payment = false;
  if (scenario === 'capability') {
    catalog.development_mock_payment = false;
    catalog.mock_payment_enabled = true;
  }
  const state = {
    user,
    orders: [] as BillingOrder[],
    createKeys: [] as string[],
    payKeys: [] as string[],
    createCalls: 0,
    payCalls: 0,
    failBalance: false,
  };
  const keys = new Map<string, BillingOrder>();
  await page.addInitScript((user) => {
    sessionStorage.setItem(
      'interview-session',
      JSON.stringify({ state: { token: 'fixture', user, mode: 'live' }, version: 0 }),
    );
  }, user);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const fail = () =>
      route.fulfill({
        status: 503,
        json: { code: 'TEST_UNAVAILABLE', message: '模拟网络中断，请重试', request_id: 'billing-fixture' },
      });
    let data: unknown = {};
    if (path.endsWith('/users/me')) {
      if (state.failBalance) return fail();
      data = state.user;
    } else if (path.endsWith('/billing/products')) data = catalog;
    else if (path.endsWith('/billing/entitlements'))
      data = { ...state.user, reserved_interviews: 0, reserved_by_mode: { TEXT: 0, VOICE: 0, VIDEO: 0 } };
    else if (path.endsWith('/billing/orders') && request.method() === 'POST') {
      const key = request.headers()['idempotency-key'];
      expect(key).toBeTruthy();
      state.createKeys.push(key);
      state.createCalls++;
      let order = keys.get(key);
      if (!order) {
        const product = catalog.items.find((p) => p.code === request.postDataJSON().product_code)!;
        order = {
          id: `order-${state.orders.length + 1}`,
          product_code: product.code,
          amount_minor: scenario === 'price-change' ? 7900 : product.amount_minor,
          credits: scenario === 'price-change' ? 12 : product.credits,
          interview_credits:
            scenario === 'price-change'
              ? { TEXT: 6, VOICE: 4, VIDEO: 2 }
              : scenario === 'split-change'
                ? { TEXT: 6, VOICE: 2, VIDEO: 2 }
                : product.interview_credits,
          currency: product.currency,
          status: 'PENDING',
          paid_at: null,
          refunded_at: null,
        };
        keys.set(key, order);
        state.orders.unshift(order);
      }
      if (scenario === 'lost-order' && state.createCalls === 1) return fail();
      data = order;
    } else if (path.endsWith('/billing/orders'))
      data = { items: state.orders, total: state.orders.length, page: 1, page_size: 10 };
    else if (/\/billing\/orders\/[^/]+\/dev-pay$/.test(path)) {
      const key = request.headers()['idempotency-key'];
      expect(key).toBeTruthy();
      state.payKeys.push(key);
      state.payCalls++;
      if (scenario === 'pending' && state.payCalls === 1) return fail();
      const order = state.orders.find((o) => o.id === path.split('/').at(-2))!;
      if (order.status === 'PENDING') {
        order.status = 'PAID';
        order.paid_at = new Date().toISOString();
        state.user.remaining_interviews += order.credits;
        if (order.interview_credits)
          for (const mode of ['TEXT', 'VOICE', 'VIDEO'] as const)
            state.user.interview_credits![mode] += order.interview_credits[mode];
      }
      if (scenario === 'balance-error') state.failBalance = true;
      if (scenario === 'lost-payment' && state.payCalls === 1) return fail();
      data = order;
    } else if (/\/billing\/orders\/[^/]+$/.test(path))
      data = state.orders.find((o) => o.id === path.split('/').at(-1));
    else if (path.endsWith('/job-profiles') || path.endsWith('/interviews'))
      data = { items: [], total: 0, page: 1, page_size: 100 };
    await route.fulfill({ json: { code: 'OK', message: 'success', data, request_id: 'billing-fixture' } });
  });
  await page.goto('/billing');
  await expect(page.getByRole('button', { name: '购买 10 次权益', exact: true })).toBeVisible();
  return state;
}

test('权益套餐依照后台配置类型分组，空分类不显示', async ({ page }) => {
  await fixture(page, 'normal');
  await page.goto('/billing');
  const groups = page.locator('.billing-product-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAttribute('aria-label', '次卡');
  await expect(groups.nth(0)).toContainText('单次文字训练');
  await expect(groups.nth(1)).toHaveAttribute('aria-label', '组合套餐');
  await expect(groups.nth(1)).toContainText('多模式体验套餐');
});
const confirm = (page: Page) => page.getByRole('button', { name: /^确认购买 · 模拟支付/ });
async function openPack(page: Page) {
  await page.getByRole('button', { name: '购买 10 次权益', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('微信支付');
  await expect(page.getByRole('dialog')).toContainText('支付宝');
  await expect(page.getByRole('dialog').locator('[aria-disabled="true"]')).toHaveCount(2);
}
async function expectSuccess(page: Page, balance: number) {
  await expect(page.getByRole('dialog', { name: '权益购买成功' })).toBeVisible();
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await expect(page.locator('.billing-balance-amount strong')).toHaveText(String(balance));
  await expect(page.locator('.quota-amount b')).toContainText(String(balance));
}

test('本地演示：选择套餐、模拟成功、权益到账、购买记录与刷新恢复，移动端无横向溢出', async ({ page }) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await page.getByRole('link', { name: '我的权益', exact: true }).click();
  await expect(page.locator('.billing-balance-amount strong')).toHaveText('99');
  await openPack(page);
  await page.screenshot({ path: 'test-results/billing-checkout.png', animations: 'disabled' });
  await confirm(page).click();
  await expectSuccess(page, 109);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('region', { name: '购买记录' })).toContainText('购买成功');
  await page.reload();
  await expect(page.locator('.billing-balance-amount strong')).toHaveText('109');
  await expect(page.locator('.billing-order')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/billing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/billing-mobile.png', fullPage: true });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('支付失败后刷新并继续同一订单，权益只发放一次', async ({ page }) => {
  const state = await fixture(page, 'pending');
  await openPack(page);
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('模拟网络中断');
  expect(state.user.remaining_interviews).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '继续模拟支付', exact: true }).click();
  await confirm(page).click();
  await expectSuccess(page, 10);
  expect(state.createCalls).toBe(1);
  expect(state.orders).toHaveLength(1);
  expect(state.payKeys[0]).toBe(state.payKeys[1]);
  expect(state.user.remaining_interviews).toBe(10);
  await page.getByRole('dialog').getByRole('link', { name: '开始面试', exact: true }).click();
  await expect(page.locator('.summary-credits b')).toHaveText('5');
  await expect(page.getByRole('button', { name: '创建专属面试', exact: true })).toBeEnabled();
});

test('模拟回调已成功但响应丢失时，查询订单确认成功并刷新额度', async ({ page }) => {
  const state = await fixture(page, 'lost-payment');
  await openPack(page);
  await confirm(page).click();
  await expectSuccess(page, 10);
  expect(state.payCalls).toBe(1);
  expect(state.createCalls).toBe(1);
  await page.reload();
  await expect(page.locator('.billing-balance-amount strong')).toHaveText('10');
  await expect(page.getByRole('button', { name: '继续模拟支付', exact: true })).toHaveCount(0);
});

test('创建订单响应丢失后，刷新并再次购买复用原来的创建键', async ({ page }) => {
  const state = await fixture(page, 'lost-order');
  await openPack(page);
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('模拟网络中断');
  await page.reload();
  await openPack(page);
  await confirm(page).click();
  await expectSuccess(page, 10);
  expect(state.orders).toHaveLength(1);
  expect(state.createKeys).toHaveLength(2);
  expect(state.createKeys[0]).toBe(state.createKeys[1]);
});

test('套餐价格和次数更新后，按服务端订单再次确认才能支付', async ({ page }) => {
  const state = await fixture(page, 'price-change');
  await openPack(page);
  await confirm(page).click();
  await expect(page.getByRole('dialog')).toContainText('套餐信息已更新');
  await expect(page.getByRole('dialog')).toContainText('12 次练习权益');
  await expect(page.getByRole('dialog')).toContainText('79.00');
  expect(state.payCalls).toBe(0);
  await confirm(page).click();
  await expectSuccess(page, 12);
  expect(state.createCalls).toBe(1);
});

test('服务端关闭模拟支付时，页面不能提交购买', async ({ page }) => {
  const state = await fixture(page, 'disabled');
  await expect(page.getByText('当前服务未开启模拟支付，套餐暂不可购买。')).toBeVisible();
  await expect(page.getByRole('button', { name: '购买 10 次权益', exact: true })).toBeDisabled();
  expect(state.createCalls).toBe(0);
  expect(state.payCalls).toBe(0);
});

test('购买成功后用户信息刷新失败，保留成功结果并可单独同步权益', async ({ page }) => {
  const state = await fixture(page, 'balance-error');
  await openPack(page);
  await confirm(page).click();
  await expectSuccess(page, 10);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('购买已成功');
  state.failBalance = false;
  await page.getByRole('dialog').getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  expect(state.payCalls).toBe(1);
  expect(state.createCalls).toBe(1);
});

test('分类组合变化但总次数和金额相同时，也必须重新确认订单', async ({ page }) => {
  const state = await fixture(page, 'split-change');
  await openPack(page);
  await confirm(page).click();
  await expect(page.getByRole('dialog')).toContainText('套餐信息已更新');
  await expect(page.getByRole('dialog')).toContainText('文字 6 次 + 语音 2 次 + 视频 2 次');
  expect(state.payCalls).toBe(0);
  await confirm(page).click();
  await expectSuccess(page, 10);
  await expect(page.getByRole('region', { name: '文字面试权益' })).toContainText('6');
  await expect(page.getByRole('region', { name: '语音面试权益' })).toContainText('2');
});


test('购买能力由开关控制，不受旧开发环境标记限制', async ({ page }) => {
  const state = await fixture(page, 'capability');
  await openPack(page);
  await confirm(page).click();
  await expectSuccess(page, 10);
  expect(state.createCalls).toBe(1);
  expect(state.payCalls).toBe(1);
});
