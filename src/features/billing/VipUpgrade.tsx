import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { useSession } from '../../stores/session';
import { userStorageKey } from '../../utils/userStorageKey';
import { completePurchase, money, purchaseAttempt, rememberPurchase } from './purchase';
import { sameCredits } from './credits';
import { ErrorState, Loading } from '../../components/common/ui';
import type { BillingOrder } from '../../types/domain';
import '../../styles/vip.css';

export function VipUpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession(s => s.user);
  const uid = userStorageKey(user);
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['billing-products', uid], queryFn: api.products, enabled: open });
  const products = (catalog.data?.items || []).filter(product => (product.vip_days || 0) > 0);
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<BillingOrder | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const selected = products.find(product => product.code === code) || products[0];
  const details = order || selected;
  const canPay = (catalog.data?.mock_payment_enabled ?? catalog.data?.development_mock_payment) === true;
  useEffect(() => { if (open) { setSuccess(false); setOrder(null); setError(null); setNotice(''); } }, [open]);

  async function completed(paid: BillingOrder) {
    if (paid.status !== 'PAID') throw new Error('尚未确认支付成功，请重试此订单。');
    completePurchase(uid, paid);
    await queryClient.cancelQueries({ queryKey: ['me'] });
    const [me, balance] = await Promise.allSettled([api.me(), api.entitlements()]);
    if (userStorageKey(useSession.getState().user) !== uid) return;
    if (me.status === 'fulfilled') {
      useSession.getState().setUser(me.value);
      queryClient.setQueryData(['me'], me.value);
    } else if (balance.status === 'fulfilled') {
      useSession.getState().setUser({ ...useSession.getState().user!, ...balance.value });
    }
    setOrder(paid); setSuccess(true);
    if (me.status === 'rejected' && balance.status === 'rejected') setNotice('开通已成功，会员信息暂未刷新，请稍后刷新页面查看。');
    await Promise.all(['company-questions', 'practice-quota', 'orders', 'entitlements'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
  }
  async function buy() {
    if (!selected || lock.current || !canPay) return;
    lock.current = true; setBusy(true); setError(null); setNotice('');
    let pending = order;
    try {
      if (!pending) {
        const attempt = purchaseAttempt(uid, selected.code);
        pending = attempt.orderId ? await api.order(attempt.orderId) : await api.createOrder(selected.code, attempt.key);
        rememberPurchase(uid, { ...attempt, orderId: pending.id });
        setOrder(pending);
        if (pending.status === 'PENDING' && (pending.amount_minor !== selected.amount_minor || pending.currency !== selected.currency || !sameCredits(pending, selected))) {
          setNotice('套餐配置已更新，请确认当前订单价格和VIP天数，再点击开通。');
          return;
        }
      }
      if (pending.status === 'PAID') { await completed(pending); return; }
      if (pending.status !== 'PENDING') { completePurchase(uid, pending); throw new Error('订单已关闭，请重新选择套餐。'); }
      if (userStorageKey(useSession.getState().user) !== uid) throw new Error('账号已切换，请重新登录后开通。');
      await completed(await api.mockPay(pending.id, `vip-pay:${uid}:${pending.id}`));
    } catch (failure) {
      const paid = pending ? await api.order(pending.id).catch(() => null) : null;
      if (paid?.status === 'PAID') await completed(paid);
      else setError(failure);
    } finally { lock.current = false; setBusy(false); }
  }

  return <Modal open={open} title={null} footer={null} onCancel={onClose} closable={!busy} maskClosable={!busy} width={560} centered destroyOnHidden>
    <div className="vip-upgrade-modal">
      <span className="vip-modal-crown"><Crown size={32} /></span>
      <h2>{success ? '欢迎成为 VIP 会员' : user?.membership?.active ? '续费 VIP，持续进步' : '开通 VIP，解锁大厂真题'}</h2>
      <p>{success ? '会员权益已生效，金色VIP角标已点亮。' : '从题目到追问，再到有证据的复盘，练透每一道题。'}</p>
      {!success && <ul className="vip-benefit-list"><li><Check size={17} />全部已发布公司的对应岗位真题</li><li><Check size={17} />文字 / 语音作答，最多三轮深入追问</li><li><Check size={17} />六维评分、回答证据与优缺点复盘</li><li><Check size={17} />专属金色 VIP 头像角标</li></ul>}
      <ErrorState error={error || catalog.error} />
      {catalog.isLoading ? <Loading label="正在加载VIP套餐…" /> : success ? <div className="vip-purchase-success"><ShieldCheck size={26} /><strong>{order?.vip_days} 天 VIP 已开通</strong><span>{user?.membership?.expires_at ? `有效期至 ${new Date(user.membership.expires_at).toLocaleString('zh-CN')}` : '权益已记录到你的账号'}</span></div> : products.length ? <>
        <div className="vip-plan-options">{products.map(product => <button key={product.code} type="button" disabled={busy} className={selected?.code === product.code ? 'selected' : ''} onClick={() => { setCode(product.code); setOrder(null); setNotice(''); setError(null); }}><span><strong>{product.name}</strong><small>{product.vip_days} 天 VIP{product.credits ? ` · 含 ${product.credits} 次模拟面试` : ''}</small></span><b>{money(product.amount_minor, product.currency)}</b></button>)}</div>
        <div className="vip-order-summary"><span>本次开通 {details?.vip_days} 天 VIP</span><strong>{money(details?.amount_minor || 0, details?.currency)}</strong></div>
        <button className="btn vip-purchase-button" disabled={busy || !canPay} onClick={() => void buy()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Crown size={18} />}{busy ? '正在开通…' : canPay ? '模拟支付并开通 VIP' : '支付暂未开放'}</button>
        <p className="vip-payment-note">{canPay ? '当前为开发环境模拟支付，成功后立即生效，无需真实付款。' : '当前支付渠道暂不可用，请联系管理员开通VIP。'}</p>
      </> : <div className="vip-no-products">VIP套餐暂未上架，请联系管理员。</div>}
      {notice && <p className="vip-payment-note" role="status">{notice}</p>}
      {success ? <button className="btn primary full" onClick={onClose}>完成开通，继续体验</button> : <div className="vip-modal-links"><Link to="/billing#vip" onClick={onClose}>前往权益中心</Link><Link to="/profile" onClick={onClose}>前往个人中心</Link></div>}
    </div>
  </Modal>;
}

export function VipUpgradeButton({ children, className = 'btn vip-upgrade-button' }: { children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const vip = useSession(s => s.user?.membership?.active);
  return <><button className={className} type="button" onClick={() => setOpen(true)}><Crown size={16} />{children || (vip ? '续费 VIP' : '升级 VIP')}</button><VipUpgradeModal open={open} onClose={() => setOpen(false)} /></>;
}

export function VipUpgradeCard() {
  const membership = useSession(s => s.user?.membership);
  return <section className="panel vip-upgrade-card" aria-label="VIP会员开通入口"><span className="vip-card-icon"><Sparkles size={27} /></span><div><h2>{membership?.active ? 'VIP 会员 · 大厂真题尽情练' : '升级 VIP，解锁完整真题实操'}</h2><p>{membership?.active ? `有效期至 ${new Date(membership.expires_at!).toLocaleDateString('zh-CN')}` : '按岗位练习全部已发布大厂真题，获得 AI 追问与多维复盘。'}</p></div><VipUpgradeButton /></section>;
}
