import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Modal } from 'antd';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Gift,
  LoaderCircle,
  Package,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { api } from '../services/api';
import { queryClient } from '../app/query';
import { useSession } from '../stores/session';
import { completePurchase, money, purchaseAttempt, rememberPurchase } from '../features/billing/purchase';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { dateText } from '../utils/interview';
import type { BillingOrder, Product, UsageRecord } from '../types/domain';
import { creditLabels, creditModes, creditsText, sameCredits } from '../features/billing/credits';
import { groupProducts } from '../features/billing/catalog';

type Checkout = { product: Product; order?: BillingOrder };
type PaymentPhase = 'review' | 'creating' | 'paying' | 'success';
const orderLabels: Record<BillingOrder['status'], string> = {
  PENDING: '待支付',
  PAID: '购买成功',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
};
const rewardUsageTypes = new Set(['INVITER_REWARD', 'INVITEE_REWARD']);
const rewardModeNames: Record<string, string> = {
  TEXT: '文字面试',
  VOICE: '语音面试',
  VIDEO: '视频面试',
  UNIVERSAL: '通用',
};

export default function Billing() {
  const { user } = useSession();
  const userId = user!.id;
  const [page, setPage] = useState(1);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [phase, setPhase] = useState<PaymentPhase>('review');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const catalog = useQuery({ queryKey: ['billing-products', userId], queryFn: api.products });
  const balance = useQuery({ queryKey: ['entitlements', userId], queryFn: api.entitlements });
  const usage = useQuery({ queryKey: ['usage-rewards', userId], queryFn: api.rewardUsage });
  const referralRewards = (usage.data ?? []).filter((item) => rewardUsageTypes.has(item.usage_type));
  const orders = useQuery({ queryKey: ['orders', userId, page], queryFn: () => api.orders(page) });
  const canPay = (catalog.data?.mock_payment_enabled ?? catalog.data?.development_mock_payment) === true;

  function openCheckout(product: Product, order?: BillingOrder) {
    if (locked.current) return;
    setCheckout({ product, order });
    setPhase('review');
    setError(null);
    setSyncError(null);
    setNotice('');
  }
  async function syncBalance() {
    setSyncError(null);
    await queryClient.cancelQueries({ queryKey: ['me'] });
    const [me, entitlement] = await Promise.allSettled([api.me(), api.entitlements()]);
    if (useSession.getState().user?.id !== userId) return;
    if (me.status === 'fulfilled') {
      useSession.getState().setUser(me.value);
      queryClient.setQueryData(['me'], me.value);
    }
    if (entitlement.status === 'fulfilled') {
      queryClient.setQueryData(['entitlements', userId], entitlement.value);
      if (me.status !== 'fulfilled') {
        const current = useSession.getState().user!;
        const updated = { ...current, ...entitlement.value };
        useSession.getState().setUser(updated);
        queryClient.setQueryData(['me'], updated);
      }
    }
    if (me.status === 'rejected' || entitlement.status === 'rejected')
      setSyncError(new Error('购买已成功，部分权益信息暂未刷新，请重试同步。'));
    await queryClient.invalidateQueries({ queryKey: ['orders', userId] });
  }
  async function purchased(order: BillingOrder, product: Product) {
    setCheckout({ product, order });
    setPhase('success');
    completePurchase(userId, order);
    await syncBalance();
  }
  async function pay() {
    if (!checkout || !canPay || locked.current) return;
    locked.current = true;
    setSubmitting(true);
    setError(null);
    setNotice('');
    let order = checkout.order;
    try {
      if (!order) {
        setPhase('creating');
        const attempt = purchaseAttempt(userId, checkout.product.code);
        order = attempt.orderId
          ? await api.order(attempt.orderId)
          : await api.createOrder(checkout.product.code, attempt.key);
        rememberPurchase(userId, { ...attempt, orderId: order.id });
        setCheckout({ product: checkout.product, order });
        void queryClient.invalidateQueries({ queryKey: ['orders', userId] });
        if (
          order.status === 'PENDING' &&
          (order.amount_minor !== checkout.product.amount_minor ||
            !sameCredits(order, checkout.product) ||
            order.currency !== checkout.product.currency)
        ) {
          setNotice('套餐信息已更新，请确认下方订单金额和权益后再模拟支付。');
          setPhase('review');
          return;
        }
      }
      if (order.status === 'PAID') {
        await purchased(order, checkout.product);
        return;
      }
      if (order.status !== 'PENDING') {
        completePurchase(userId, order);
        throw new Error('此订单已关闭或退款，请关闭窗口后重新选择套餐。');
      }
      if (useSession.getState().user?.id !== userId) return;
      setPhase('paying');
      // This authenticated endpoint simulates a successful callback when enabled.
      // The server changes the order and grants the credits in one transaction.
      const paid = await api.mockPay(order.id, `mock-pay:${userId}:${order.id}`);
      if (paid.status !== 'PAID') throw new Error('尚未确认支付成功，请重试查询此订单。');
      await purchased(paid, checkout.product);
    } catch (e) {
      // A lost callback response can still mean the server has already granted credits.
      const latest = order ? await api.order(order.id).catch(() => null) : null;
      if (latest?.status === 'PAID') await purchased(latest, checkout.product);
      else {
        setError(e);
        setPhase('review');
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }
  const receipt = checkout?.order;
  const amount = receipt?.amount_minor ?? checkout?.product.amount_minor ?? 0;
  const credits = receipt?.credits ?? checkout?.product.credits ?? 0;
  const currency = receipt?.currency ?? checkout?.product.currency ?? 'CNY';
  return (
    <div className="billing-page">
      <PageHeading
        eyebrow="MAKE ROOM FOR YOUR NEXT OPPORTUNITY"
        title="我的权益"
        description="选择适合自己的练习计划，为下一次面试多一份准备。"
      />
      <section className="panel billing-balance" aria-label="当前面试权益">
        <div className="billing-balance-title">
          <span>
            <Wallet size={24} />
          </span>
          <div>
            <h2>可用练习次数</h2>
            <p>按面试类型分别管理练习机会</p>
          </div>
        </div>
        <div className="billing-balance-amount">
          <strong>{balance.data?.remaining_interviews ?? '—'}</strong>
          <span>次可用</span>
        </div>
        <div className="billing-reserved">
          <b>{balance.data?.reserved_interviews ?? '—'} 次已预占</b>
          <span>创建时预占，开始后扣除；未开始的面试取消后释放。</span>
        </div>
      </section>
      <div className="billing-mode-balances">
        {creditModes.map((mode) => (
          <section
            className="panel billing-mode-balance"
            key={mode}
            aria-label={`${creditLabels[mode]}面试权益`}
          >
            <span>{creditLabels[mode]}面试</span>
            <strong>
              {balance.data ? (balance.data.interview_credits?.[mode] ?? 0) : '—'}
              <small> 次可用</small>
            </strong>
            <p>{balance.data?.reserved_by_mode?.[mode] ?? 0} 次已预占</p>
          </section>
        ))}
      </div>
      {(balance.data?.universal_interviews ??
        (balance.data?.interview_credits ? 0 : balance.data?.remaining_interviews) ??
        0) > 0 && (
        <p className="billing-universal">
          另有 <b>{balance.data?.universal_interviews ?? balance.data?.remaining_interviews}</b>{' '}
          次通用权益，优先使用对应类型次数，不足时使用通用次数。
        </p>
      )}
      <section className="panel entitlement-rewards" aria-label="邀请奖励到账记录">
        <div className="billing-section-heading">
          <div>
            <h2>
              <Gift size={18} /> 邀请奖励到账记录
            </h2>
            <p>好友完成注册或达到邀请奖励门槛后发放的权益</p>
          </div>
        </div>
        {usage.isPending ? (
          <Loading label="正在读取权益记录…" />
        ) : usage.isError ? (
          <ErrorState error={usage.error} retry={() => void usage.refetch()} />
        ) : referralRewards.length ? (
          <div className="entitlement-reward-list">
            {referralRewards.map((record: UsageRecord) => (
              <div className="entitlement-reward-row" key={record.id}>
                <span className="entitlement-reward-icon">
                  <Gift size={17} />
                </span>
                <div className="entitlement-reward-info">
                  <strong>
                    {record.usage_type === 'INVITER_REWARD' ? '邀请好友奖励' : '邀请码注册奖励'}
                  </strong>
                  <small>
                    {Object.entries(record.credit_allocations)
                      .filter(([, quantity]) => Number(quantity) > 0)
                      .map(([mode, quantity]) => `${rewardModeNames[mode] ?? mode} +${quantity} 次`)
                      .join(' · ')}
                  </small>
                </div>
                <time>{dateText(record.created_at)}</time>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted entitlement-rewards-empty">暂时没有邀请奖励记录。</p>
        )}
      </section>
      {balance.isError && <ErrorState error={balance.error} retry={() => void balance.refetch()} />}
      <div className="billing-mock-note">
        <ShieldCheck size={18} />
        <div>
          <strong>当前为模拟支付，不会产生真实扣款</strong>
          <p>确认购买后将模拟支付成功，并为当前账号发放所购练习次数。</p>
        </div>
      </div>
      <section aria-label="选择权益套餐">
        <div className="billing-section-heading">
          <div>
            <h2>给练习留一点空间</h2>
            <p>套餐金额与次数以当前服务提供的信息为准</p>
          </div>
          <span className="tag">次数按需购买</span>
        </div>
        {catalog.isPending ? (
          <Loading label="正在加载权益套餐…" />
        ) : catalog.isError ? (
          <ErrorState error={catalog.error} retry={() => void catalog.refetch()} />
        ) : (
          <div className="billing-product-groups">
            {groupProducts(catalog.data.items).map((group) => (
              <section className="billing-product-group" key={group.kind} aria-label={group.label}>
                <h3>{group.label}</h3>
                <div className="billing-products">
                  {group.items.map((product) => (
                    <article
                      className={`panel billing-product ${product.code === 'PACK_10' ? 'featured' : ''}`}
                      key={product.code}
                    >
                      <div className="billing-product-top">
                        <Package size={23} />
                        {product.code === 'PACK_10' && <span className="tag">循序练习</span>}
                      </div>
                      <h3>{product.name}</h3>
                      <p>{product.credits} 次完整模拟面试</p>
                      <p className="billing-credit-breakdown">{creditsText(product)}</p>
                      <div className="billing-price">
                        <strong>{money(product.amount_minor, product.currency)}</strong>
                        <span> / 份</span>
                      </div>
                      <small>
                        每次 {money(product.amount_minor / Math.max(1, product.credits), product.currency)}
                      </small>
                      <ul>
                        <li>
                          <Check size={15} />
                          按套餐所含类型使用
                        </li>
                        <li>
                          <Check size={15} />
                          岗位定制提问与面试复盘
                        </li>
                        <li>
                          <Check size={15} />
                          购买后增加 {product.credits} 次可用额度
                        </li>
                      </ul>
                      <button
                        className={`btn ${product.code === 'PACK_10' ? 'primary' : 'secondary'} full`}
                        disabled={!canPay || submitting}
                        onClick={() => openCheckout(product)}
                      >
                        <Sparkles size={16} />
                        购买 {product.credits} 次权益
                        <ArrowRight size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {catalog.isSuccess && !canPay && (
          <div className="info-banner">当前服务未开启模拟支付，套餐暂不可购买。</div>
        )}
        {catalog.isSuccess && !catalog.data.items.length && <p className="muted">暂无可购买的权益套餐。</p>}
      </section>
      <section className="panel billing-orders" aria-label="购买记录">
        <div className="panel-heading">
          <div>
            <h2>
              <ReceiptText size={19} />
              购买记录
            </h2>
            <p>支付中断时，可继续支付同一笔待支付订单</p>
          </div>
          <button className="text-link" disabled={orders.isFetching} onClick={() => void orders.refetch()}>
            刷新记录
          </button>
        </div>
        {orders.isPending ? (
          <Loading label="正在读取购买记录…" />
        ) : orders.isError ? (
          <ErrorState error={orders.error} retry={() => void orders.refetch()} />
        ) : !orders.data.items.length ? (
          <div className="billing-orders-empty">
            <ReceiptText size={29} />
            <p>还没有购买记录，选一个适合你的练习套餐吧。</p>
          </div>
        ) : (
          <div className="billing-order-list">
            {orders.data.items.map((order) => (
              <div className="billing-order" key={order.id}>
                <div>
                  <strong>{order.credits} 次练习权益</strong>
                  <small className="billing-credit-breakdown">{creditsText(order)}</small>
                  <small>订单号：{order.id}</small>
                  {order.paid_at && <small>{dateText(order.paid_at)} 购买</small>}
                </div>
                <div className="billing-order-amount">
                  <strong>{money(order.amount_minor, order.currency)}</strong>
                  <span className={`tag ${order.status === 'PAID' ? 'green' : ''}`}>
                    {orderLabels[order.status] || order.status}
                  </span>
                </div>
                {order.status === 'PENDING' && (
                  <button
                    className="btn secondary small"
                    disabled={!canPay || submitting}
                    onClick={() =>
                      openCheckout(
                        {
                          code: order.product_code,
                          name:
                            catalog.data?.items.find((p) => p.code === order.product_code)?.name ||
                            `${order.credits} 次练习权益`,
                          ...order,
                        },
                        order,
                      )
                    }
                  >
                    继续模拟支付
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {orders.data && orders.data.total > orders.data.page_size && (
          <div className="billing-pagination">
            <button
              className="btn secondary small"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className="btn secondary small"
              disabled={page * orders.data.page_size >= orders.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </section>
      <Modal
        open={!!checkout}
        title={phase === 'success' ? '权益购买成功' : '确认购买权益'}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        onCancel={() => {
          if (!submitting) setCheckout(null);
        }}
        footer={null}
        width={480}
      >
        {checkout &&
          (phase === 'success' ? (
            <div className="billing-success" role="status">
              <CheckCircle2 size={54} />
              <h3>购买成功，练习机会已增加</h3>
              <p>
                本次获得 <b>{credits} 次</b>练习权益
              </p>
              <p className="billing-credit-breakdown">{creditsText(receipt ?? checkout.product)}</p>
              <strong>{money(amount, currency)}</strong>
              <span className="tag">模拟支付 · 未真实扣款</span>
              {receipt && <small>订单号：{receipt.id}</small>}
              {submitting && (
                <p className="inline">
                  <LoaderCircle size={16} className="spin" />
                  正在同步权益…
                </p>
              )}
              {syncError !== null && <ErrorState error={syncError} retry={() => void syncBalance()} />}
              <div className="billing-modal-actions">
                <button className="btn secondary" disabled={submitting} onClick={() => setCheckout(null)}>
                  完成
                </button>
                <Link className="btn primary" to="/interviews/new">
                  开始面试
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="billing-checkout">
              <p className="billing-checkout-name">{checkout.product.name}</p>
              <dl>
                <div>
                  <dt>本次增加</dt>
                  <dd>{credits} 次练习权益</dd>
                </div>
                <div>
                  <dt>次数明细</dt>
                  <dd className="billing-credit-breakdown">{creditsText(receipt ?? checkout.product)}</dd>
                </div>
                <div>
                  <dt>订单金额</dt>
                  <dd className="billing-checkout-price">{money(amount, currency)}</dd>
                </div>
              </dl>
              <p className="billing-payment-label">支付方式</p>
              <div className="billing-payment selected">
                <CreditCard size={20} />
                <span>
                  <strong>模拟支付</strong>
                  <small>模拟成功回调，立即发放权益</small>
                </span>
                <CheckCircle2 size={18} />
              </div>
              <div className="billing-payment unavailable" aria-disabled="true">
                <Wallet size={20} />
                <span>微信支付</span>
                <small>暂不可用</small>
              </div>
              <div className="billing-payment unavailable" aria-disabled="true">
                <Wallet size={20} />
                <span>支付宝</span>
                <small>暂不可用</small>
              </div>
              <p className="billing-payment-note">本次为模拟交易，不会跳转支付应用或产生真实扣款。</p>
              {notice && (
                <div className="info-banner" role="status">
                  {notice}
                </div>
              )}
              {error !== null && <ErrorState error={error} />}
              <button
                className="btn primary full"
                disabled={submitting || !canPay}
                onClick={() => void pay()}
              >
                {submitting ? <LoaderCircle size={17} className="spin" /> : <CreditCard size={17} />}
                {phase === 'creating'
                  ? '正在创建订单…'
                  : phase === 'paying'
                    ? '模拟支付回调中…'
                    : `确认购买 · 模拟支付 ${money(amount, currency)}`}
              </button>
              {receipt && (
                <small className="billing-checkout-order">
                  订单号：{receipt.id} · 关闭后可在购买记录继续支付
                </small>
              )}
            </div>
          ))}
      </Modal>
    </div>
  );
}
