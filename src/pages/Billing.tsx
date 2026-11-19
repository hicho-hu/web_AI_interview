import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Modal, Tabs } from 'antd';
import {
  ArrowRight,
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
import { userStorageKey } from '../utils/userStorageKey';
import {
  completePurchase,
  money,
  purchaseAttempt,
  rememberPurchase,
} from '../features/billing/purchase';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { dateText } from '../utils/interview';
import type { BillingOrder, Product, UsageRecord } from '../types/domain';
import {
  creditLabels,
  creditModes,
  creditsText,
  sameCredits,
} from '../features/billing/credits';
import { groupProducts } from '../features/billing/catalog';
import { VipUpgradeCard } from '../features/billing/VipUpgrade';
import '../styles/question-practice.css';
import '../styles/billing-compact.css';

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
  const userId = userStorageKey(user);
  const [page, setPage] = useState(1);
  const [billingTab, setBillingTab] = useState('products');
  const [productGroup, setProductGroup] = useState('VIP');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [phase, setPhase] = useState<PaymentPhase>('review');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const catalog = useQuery({
    queryKey: ['billing-products', userId],
    queryFn: api.products,
  });
  const balance = useQuery({
    queryKey: ['entitlements', userId],
    queryFn: api.entitlements,
  });
  const usage = useQuery({
    queryKey: ['usage-rewards', userId],
    queryFn: api.rewardUsage,
    enabled: billingTab === 'rewards',
  });
  const referralRewards = (usage.data ?? []).filter((item) =>
    rewardUsageTypes.has(item.usage_type),
  );
  const orders = useQuery({
    queryKey: ['orders', userId, page],
    queryFn: () => api.orders(page),
    enabled: billingTab === 'orders',
  });
  const canPay =
    (catalog.data?.mock_payment_enabled ??
      catalog.data?.development_mock_payment) === true;
  const vipProducts = (catalog.data?.items || []).filter(
    (product) => (product.vip_days || 0) > 0,
  );
  const productGroups = [
    ...(vipProducts.length
      ? [{ kind: 'VIP', label: 'VIP会员', items: vipProducts }]
      : []),
    ...groupProducts(
      (catalog.data?.items || []).filter((product) => !product.vip_days),
    ),
  ];
  const activeProductGroup = productGroups.some(
    (group) => group.kind === productGroup,
  )
    ? productGroup
    : productGroups[0]?.kind;

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
    const [me, entitlement] = await Promise.allSettled([
      api.me(),
      api.entitlements(),
    ]);
    if (userStorageKey(useSession.getState().user) !== userId) return;
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
      if (userStorageKey(useSession.getState().user) !== userId) return;
      setPhase('paying');
      // This authenticated endpoint simulates a successful callback when enabled.
      // The server changes the order and grants the credits in one transaction.
      const paid = await api.mockPay(
        order.id,
        `mock-pay:${userId}:${order.id}`,
      );
      if (paid.status !== 'PAID')
        throw new Error('尚未确认支付成功，请重试查询此订单。');
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
  const currency = receipt?.currency ?? checkout?.product.currency ?? 'CNY';
  const rewardsContent = (
    <section
      className="panel entitlement-rewards"
      aria-label="邀请奖励到账记录"
    >
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
                  {record.usage_type === 'INVITER_REWARD'
                    ? '邀请好友奖励'
                    : '邀请码注册奖励'}
                </strong>
                <small>
                  {Object.entries(record.credit_allocations)
                    .filter(([, quantity]) => Number(quantity) > 0)
                    .map(
                      ([mode, quantity]) =>
                        `${rewardModeNames[mode] ?? mode} +${quantity} 次`,
                    )
                    .join(' · ')}
                </small>
              </div>
              <time>{dateText(record.created_at)}</time>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted entitlement-rewards-empty">
          暂时没有邀请奖励记录。
        </p>
      )}
    </section>
  );
  const ordersContent = (
    <section className="panel billing-orders" aria-label="购买记录">
      <div className="panel-heading">
        <div>
          <h2>
            <ReceiptText size={19} />
            购买记录
          </h2>
          <p>支付中断时，可继续支付同一笔待支付订单</p>
        </div>
        <button
          className="text-link"
          disabled={orders.isFetching}
          onClick={() => void orders.refetch()}
        >
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
                <strong>
                  {order.vip_days
                    ? `${order.vip_days} 天 VIP 权益`
                    : `${order.credits} 次练习权益`}
                </strong>
                <small className="billing-credit-breakdown">
                  {creditsText(order)}
                </small>
                <small>订单号：{order.id}</small>
                {order.paid_at && <small>{dateText(order.paid_at)} 购买</small>}
              </div>
              <div className="billing-order-amount">
                <strong>{money(order.amount_minor, order.currency)}</strong>
                <span
                  className={`tag ${order.status === 'PAID' ? 'green' : ''}`}
                >
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
                          catalog.data?.items.find(
                            (p) => p.code === order.product_code,
                          )?.name || `${order.credits} 次练习权益`,
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
  );
  const productsContent = (
    <section aria-label="选择权益套餐">
      <div className="billing-section-heading">
        <div>
          <h2>选择适合你的权益</h2>
          <p>按类型切换套餐，购买前可核对价格与权益明细</p>
        </div>
        <span className="tag">次数按需购买</span>
      </div>
      {catalog.isPending ? (
        <Loading label="正在加载权益套餐…" />
      ) : catalog.isError ? (
        <ErrorState
          error={catalog.error}
          retry={() => void catalog.refetch()}
        />
      ) : (
        <>
          <Tabs
            className="billing-category-tabs"
            activeKey={activeProductGroup}
            onChange={setProductGroup}
            items={productGroups.map((group) => ({
              key: group.kind,
              label: group.label,
            }))}
          />
          <div className="billing-product-groups">
            {productGroups
              .filter((group) => group.kind === activeProductGroup)
              .map((group) => (
                <section
                  className="billing-product-group"
                  key={group.kind}
                  aria-label={group.label}
                >
                  <h3>{group.label}</h3>
                  <div className="billing-products">
                    {group.items.map((product) => (
                      <article
                        className={`panel billing-product ${product.code === 'PACK_10' ? 'featured' : ''}`}
                        key={product.code}
                      >
                        <div className="billing-product-top">
                          <Package size={23} />
                          {product.code === 'PACK_10' && (
                            <span className="tag">循序练习</span>
                          )}
                        </div>
                        <h3>{product.name}</h3>
                        <p className="billing-credit-breakdown">
                          {creditsText(product)}
                        </p>
                        <div className="billing-price">
                          <strong>
                            {money(product.amount_minor, product.currency)}
                          </strong>
                          <span> / 份</span>
                        </div>
                        <small>
                          {product.credits
                            ? `每次 ${money(product.amount_minor / product.credits, product.currency)}`
                            : '有效期内解锁全部已发布真题'}
                        </small>

                        <button
                          className={`btn ${product.code === 'PACK_10' ? 'primary' : 'secondary'} full`}
                          disabled={!canPay || submitting}
                          onClick={() => openCheckout(product)}
                        >
                          <Sparkles size={16} />
                          {product.vip_days
                            ? '购买 VIP 权益'
                            : `购买 ${product.credits} 次权益`}
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
          </div>
        </>
      )}
      {catalog.isSuccess && !canPay && (
        <div className="info-banner">
          当前服务未开启模拟支付，套餐暂不可购买。
        </div>
      )}
      {catalog.isSuccess && !catalog.data.items.length && (
        <p className="muted">暂无可购买的权益套餐。</p>
      )}
      <p className="billing-shared-benefits">
        模拟面试套餐均含岗位定制提问与面试复盘；VIP可解锁全部已发布真题。
      </p>
      {canPay && (
        <p className="billing-compact-payment-note">
          <ShieldCheck size={14} />
          当前为模拟支付，不会产生真实扣款。
        </p>
      )}
    </section>
  );
  return (
    <div className="billing-page">
      <PageHeading
        eyebrow="MAKE ROOM FOR YOUR NEXT OPPORTUNITY"
        title="我的权益"
        description="选择适合自己的练习计划，为下一次面试多一份准备。"
      />
      <VipUpgradeCard />
      <section className="panel billing-overview" aria-label="当前面试权益">
        <div className="billing-overview-total">
          <span>
            <Wallet size={18} />
            可用模拟面试
          </span>
          <strong>
            {balance.data?.remaining_interviews ?? '—'}
            <small>次</small>
          </strong>
          <p>已预占 {balance.data?.reserved_interviews ?? '—'} 次</p>
        </div>
        <div className="billing-overview-modes">
          {creditModes.map((mode) => (
            <div key={mode}>
              <span>{creditLabels[mode]}面试</span>
              <strong>
                {balance.data?.interview_credits?.[mode] ?? '—'}
                <small>次</small>
              </strong>
              <small>
                已预占 {balance.data?.reserved_by_mode?.[mode] ?? 0} 次
              </small>
            </div>
          ))}
          <div>
            <span>通用次数</span>
            <strong>
              {balance.data?.universal_interviews ??
                (balance.data?.interview_credits
                  ? 0
                  : balance.data?.remaining_interviews) ??
                '—'}
              <small>次</small>
            </strong>
            <small>适用于全部面试类型</small>
          </div>
        </div>
      </section>
      <ErrorState error={balance.error} retry={() => void balance.refetch()} />
      <Tabs
        className="billing-main-tabs"
        activeKey={billingTab}
        onChange={setBillingTab}
        items={[
          { key: 'products', label: '购买套餐', children: productsContent },
          { key: 'orders', label: '购买记录', children: ordersContent },
          { key: 'rewards', label: '奖励明细', children: rewardsContent },
        ]}
      />
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
              <h3>{receipt?.vip_days ? '购买成功，VIP权益已生效' : '购买成功，练习机会已增加'}</h3>
              <p>
                本次获得 <b>{creditsText(receipt ?? checkout.product)}</b>
              </p>
              <p className="billing-credit-breakdown">
                {creditsText(receipt ?? checkout.product)}
              </p>
              <strong>{money(amount, currency)}</strong>
              <span className="tag">模拟支付 · 未真实扣款</span>
              {receipt && <small>订单号：{receipt.id}</small>}
              {submitting && (
                <p className="inline">
                  <LoaderCircle size={16} className="spin" />
                  正在同步权益…
                </p>
              )}
              {syncError !== null && (
                <ErrorState
                  error={syncError}
                  retry={() => void syncBalance()}
                />
              )}
              <div className="billing-modal-actions">
                <button
                  className="btn secondary"
                  disabled={submitting}
                  onClick={() => setCheckout(null)}
                >
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
                  <dd>{creditsText(receipt ?? checkout.product)}</dd>
                </div>
                <div>
                  <dt>次数明细</dt>
                  <dd className="billing-credit-breakdown">
                    {creditsText(receipt ?? checkout.product)}
                  </dd>
                </div>
                <div>
                  <dt>订单金额</dt>
                  <dd className="billing-checkout-price">
                    {money(amount, currency)}
                  </dd>
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
              <p className="billing-payment-note">
                本次为模拟交易，不会跳转支付应用或产生真实扣款。
              </p>
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
                {submitting ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <CreditCard size={17} />
                )}
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
