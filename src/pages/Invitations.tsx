import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { Copy, Gift, UsersRound } from 'lucide-react';
import { api } from '../services/api';
import { useSession } from '../stores/session';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { creditsText } from '../features/billing/credits';
import { dateText } from '../utils/interview';
import { SystemAvatar } from '../components/common/SystemAvatar';
import type { ModeCredits, UsageRecord } from '../types/domain';

const rewardText = (rewards: ModeCredits) =>
  creditsText({
    credits: Object.values(rewards).reduce((sum, value) => sum + value, 0),
    interview_credits: rewards,
  });
const rewardModeNames: Record<string, string> = {
  TEXT: '文字面试',
  VOICE: '语音面试',
  VIDEO: '视频面试',
  UNIVERSAL: '通用',
};
export default function Invitations() {
  const { user, mode } = useSession();
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: ['invitation', user?.id],
    queryFn: api.invitation,
    enabled: mode === 'live',
  });
  const data = query.data;
  const rewardRecords = data?.reward_records ?? [];
  async function copy() {
    try {
      await navigator.clipboard.writeText(data!.url);
      setCopied(true);
      void message.success('邀请链接已复制');
    } catch {
      void message.info('请选中下方链接手动复制');
    }
  }
  return (
    <div className="invitations-page">
      <PageHeading
        eyebrow="BETTER TOGETHER"
        title="邀请好友，一起更进一步"
        description="把你的专属邀请链接分享给朋友，让每一次认真准备都有回响。"
      />
      {mode === 'demo' ? (
        <div className="info-banner">
          演示模式不发放邀请奖励。连接真实后端后，可查看专属邀请码与奖励规则。
        </div>
      ) : query.isPending ? (
        <Loading label="正在读取邀请信息…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <section className="panel invitation-hero">
              <span className="advice-icon">
                <Gift size={24} />
              </span>
              <p className="section-kicker">YOUR INVITATION CODE</p>
              <h2>{data.code}</h2>
              <p>好友通过链接验证邮箱并成功注册，即计为一名有效邀请。</p>
              <div className="invitation-link">
                <input
                  aria-label="专属邀请链接"
                  readOnly
                  value={data.url}
                  onFocus={(event) => event.target.select()}
                />
                <button className="btn primary" onClick={() => void copy()}>
                  <Copy size={16} />
                  {copied ? '再次复制' : '复制邀请链接'}
                </button>
              </div>
            </section>
            <div className="invitation-stats">
              <section className="panel">
                <span>有效邀请</span>
                <strong>
                  {data.valid_invites}
                  <small> 人</small>
                </strong>
              </section>
              <section className="panel">
                <span>已获邀请奖励</span>
                <strong>
                  {data.reward_count}
                  <small> 次发放</small>
                </strong>
              </section>
              <section className="panel">
                <span>距离下一次奖励</span>
                <strong>
                  {data.rules.enabled ? data.next_reward_in : '—'}
                  <small> 人</small>
                </strong>
              </section>
            </div>
            <section className="panel invitation-rules">
              <h2>
                <Gift size={20} /> 当前奖励规则
              </h2>
              {data.rules.enabled ? (
                <>
                  <p>
                    每成功邀请 <b>{data.rules.threshold}</b> 名好友，可获得{' '}
                    <b>{rewardText(data.rules.inviter_rewards)}</b>。
                  </p>
                  <p>
                    受邀好友完成邮箱验证并注册，额外获得 <b>{rewardText(data.rules.invitee_rewards)}</b>。
                  </p>
                  <p className="muted">
                    当前规则已邀请 {data.current_rule_invites}{' '}
                    人。每达到一次门槛发放一次；新规则只影响之后注册的好友，历史奖励保留。
                  </p>
                </>
              ) : (
                <p>邀请奖励暂未开启，已获得的奖励仍可使用。</p>
              )}
            </section>
            <section className="panel invitation-history">
              <h2>
                <Gift size={20} /> 已到账的邀请权益
              </h2>
              {rewardRecords.length ? (
                rewardRecords.map((record: UsageRecord) => (
                  <div className="invitation-reward-row" key={record.id}>
                    <span>{record.usage_type === 'INVITER_REWARD' ? '邀请好友奖励' : '邀请码注册奖励'}</span>
                    <small>
                      {Object.entries(record.credit_allocations)
                        .filter(([, quantity]) => Number(quantity) > 0)
                        .map(([mode, quantity]) => `${rewardModeNames[mode] ?? mode} +${quantity} 次`)
                        .join(' · ')}
                    </small>
                    <time>{dateText(record.created_at)}</time>
                    <span className="tag green">已到账</span>
                  </div>
                ))
              ) : (
                <p className="muted">邀请奖励发放后，会显示在这里。</p>
              )}
            </section>
            <section className="panel invitation-history">
              <h2>
                <UsersRound size={20} /> 最近邀请记录
              </h2>
              {data.recent.length ? (
                data.recent.map((row) => (
                  <div className="invitation-friend-row" key={row.id}>
                    {row.avatar_url ? <img src={row.avatar_url} alt="" /> : <SystemAvatar avatarKey={row.system_avatar_key} label={row.nickname || '受邀好友'} />}
                    <span className="invitation-friend-info"><strong>{row.nickname || '新用户'}</strong><small>{row.email || '邮箱未提供'}</small></span>
                    <time>{dateText(row.registered_at)}</time>
                    <span className="tag green">已注册</span>
                  </div>
                ))
              ) : (
                <p className="muted">还没有邀请记录，分享链接给正在准备面试的朋友吧。</p>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
