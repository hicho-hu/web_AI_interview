import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from '../src/services/mock';
import { money } from '../src/features/billing/purchase';
import { availableCredits, sameCredits } from '../src/features/billing/credits';
import { defaultConfig } from '../src/features/interviews/schema';

const local = new Map<string, string>(),
  session = new Map<string, string>();
function storage(values: Map<string, string>) {
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
vi.stubGlobal('localStorage', storage(local));
vi.stubGlobal('sessionStorage', storage(session));
beforeEach(() => {
  local.clear();
  session.clear();
});

describe('模拟购买与权益', () => {
  it('组合套餐按类型到账，优先预占对应次数并在取消后原路返还', () => {
    const before = mock.user().universal_interviews;
    const order = mock.createOrder('STARTER', 'mixed-bundle');
    mock.mockPay(order.id);
    expect(mock.entitlements().interview_credits).toEqual({ TEXT: 3, VOICE: 2, VIDEO: 1 });
    const job = mock.createJob({
      job_title: '测试工程师',
      jd_text: '负责接口测试和风险分析',
      seniority: 'SENIOR',
    });
    const item = mock.create({ job_profile_id: job.id, config: { ...defaultConfig, mode: 'VIDEO' } });
    expect(mock.entitlements().interview_credits!.VIDEO).toBe(0);
    expect(mock.entitlements().universal_interviews).toBe(before);
    expect(mock.entitlements().reserved_by_mode.VIDEO).toBe(1);
    mock.action(item.interview_id, 'cancel');
    mock.action(item.interview_id, 'cancel');
    expect(mock.entitlements().interview_credits!.VIDEO).toBe(1);
    expect(mock.entitlements().reserved_interviews).toBe(0);
  });
  it('对应类型用尽时，其他类型的次数不增加该类型可用额度', () => {
    const balance = {
      remaining_interviews: 5,
      universal_interviews: 0,
      interview_credits: { TEXT: 3, VOICE: 2, VIDEO: 0 },
    };
    expect(availableCredits(balance, 'VIDEO')).toBe(0);
    expect(availableCredits({ ...balance, universal_interviews: 1 }, 'VIDEO')).toBe(1);
    expect(
      sameCredits(
        { credits: 6, interview_credits: { TEXT: 3, VOICE: 2, VIDEO: 1 } },
        { credits: 6, interview_credits: { TEXT: 5, VOICE: 0, VIDEO: 1 } },
      ),
    ).toBe(false);
  });
  it('创建订单只保存价格快照，重复成功回调只发放一次权益', () => {
    const before = mock.user().remaining_interviews;
    const first = mock.createOrder('PACK_10', 'purchase-key');
    expect(mock.createOrder('PACK_10', 'purchase-key').id).toBe(first.id);
    expect(mock.user().remaining_interviews).toBe(before);
    expect(first.status).toBe('PENDING');
    expect(first.amount_minor).toBe(6900);
    expect(() => mock.createOrder('SINGLE', 'purchase-key')).toThrow('幂等键');
    mock.mockPay(first.id);
    mock.mockPay(first.id);
    expect(mock.user().remaining_interviews).toBe(before + 10);
    expect(mock.orders().total).toBe(1);
    expect(mock.order(first.id).status).toBe('PAID');
    const next = mock.createOrder('SINGLE', 'new-purchase');
    mock.mockPay(next.id);
    expect(mock.user().remaining_interviews).toBe(before + 11);
  });
  it('购买请求在刷新后复用创建键和订单，只清理对应的已完成购买', async () => {
    vi.resetModules();
    const first = await import('../src/features/billing/purchase');
    const attempt = first.purchaseAttempt('buyer', 'PACK_10');
    first.rememberPurchase('buyer', { ...attempt, orderId: 'order-1' });
    vi.resetModules();
    const reloaded = await import('../src/features/billing/purchase');
    expect(reloaded.purchaseAttempt('buyer', 'PACK_10')).toEqual({ ...attempt, orderId: 'order-1' });
    expect(reloaded.purchaseAttempt('another-buyer', 'PACK_10').key).not.toBe(attempt.key);
    reloaded.completePurchase('buyer', { id: 'another-order', product_code: 'PACK_10' });
    expect(reloaded.purchaseAttempt('buyer', 'PACK_10').orderId).toBe('order-1');
    reloaded.completePurchase('buyer', { id: 'order-1', product_code: 'PACK_10' });
    expect(reloaded.purchaseAttempt('buyer', 'PACK_10').key).not.toBe(attempt.key);
    const size = session.size;
    reloaded.completePurchase('no-attempt', { id: 'order', product_code: 'SINGLE' });
    expect(session.size).toBe(size);
    reloaded.erasePurchaseAttempts('buyer');
    expect([...session.keys()].some((key) => key.startsWith('interview-purchase:buyer:'))).toBe(false);
    expect([...session.keys()].some((key) => key.startsWith('interview-purchase:another-buyer:'))).toBe(true);
  });
  it('按分显示金额，不把 990 分显示为 990 元', () => {
    expect(money(990)).toContain('9.90');
    expect(money(6900)).toContain('69.00');
    expect(money(9900)).toContain('99.00');
  });
});
