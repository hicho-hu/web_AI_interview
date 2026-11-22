import ResumeLibrary from '../features/resumes/ResumeLibrary';
import { VipUpgradeCard } from '../features/billing/VipUpgrade';
import VipAvatar from '../components/common/VipAvatar';
import AccountSettings from '../features/accounts/AccountSettings';
import { creditsText } from '../features/billing/credits';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  FlaskConical,
  LogOut,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '../services/api';
import { queryClient } from '../app/query';
import { useSession } from '../stores/session';
import type { ConsentKind } from '../types/domain';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { SystemAvatar } from '../components/common/SystemAvatar';
import { signedUrl } from '../features/media/urls';
import { dateText } from '../utils/interview';

const consentLabels: Record<ConsentKind, { title: string; description: string }> = {
  PRIVACY: { title: '隐私政策', description: '处理账号、岗位与面试记录的基础授权' },
  TERMS: { title: '用户协议', description: '使用面试练习服务的条款' },
  AI_PROCESSING: { title: 'AI 面试处理', description: '使用岗位、可选简历与回答生成问题和报告' },
  MICROPHONE: { title: '麦克风录制', description: '仅在主动录制时采集，用于回答转写' },
  CAMERA: { title: '摄像头录制', description: '仅用于你授权的面试录像与回放' },
  SCREEN_CAPTURE: { title: '面试录屏', description: '录制你主动选择共享的标签页或窗口，用于整场面试回放' },
};
export default function Profile() {
  const { user, mode, setUser, clear } = useSession();
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [deletionText, setDeletionText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const consents = useQuery({ queryKey: ['consents'], queryFn: api.consents });
  const save = useMutation({
    mutationFn: () => api.updateMe(nickname.trim()),
    onSuccess: (value) => {
      setUser(value);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void message.success('称呼已更新');
    },
  });
  async function logout() {
    try {
      await api.logout();
    } catch {
      /* Always clear the local session. */
    }
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  }
  async function exportData() {
    setError(null);
    try {
      const [index, jobs, history, consentData, resumeData] = await Promise.all([
        api.exportData(),
        api.allJobs(),
        api.allHistory(),
        api.consents(),
        api.allResumes(),
      ]);
      const records = await Promise.all(
        history.map(async (item) => ({
          ...item,
          turns: (await api.turns(item.id)).items.map((turn) => ({
            ...turn,
            question_audio: turn.question_audio ? { ...turn.question_audio, download_url: null } : null,
            answer_media: turn.answer_media ? { ...turn.answer_media, download_url: null } : null,
          })),
          report: item.status === 'COMPLETED' ? (await api.report(item.id)).report : null,
        })),
      );
      const blob = new Blob(
        [
          JSON.stringify(
            {
              exported_at: new Date().toISOString(),
              index,
              jobs,
              interviews: records,
              consents: consentData,
              resumes: resumeData,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `interview-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      void message.success('个人数据已导出');
    } catch (e) {
      setError(e);
    }
  }
  function changeConsent(kind: ConsentKind, active: boolean) {
    modal.confirm({
      title: `${active ? '撤回' : '授予'}${consentLabels[kind].title}授权？`,
      content: active
        ? '撤回后，依赖此项授权的操作将停止。之后可以主动重新授权。'
        : consentLabels[kind].description,
      okText: active ? '确认撤回' : '确认授权',
      cancelText: '暂不修改',
      onOk: async () => {
        try {
          if (active) await api.revoke(kind);
          else await api.consent(kind, consents.data!.policy_version);
          await consents.refetch();
          void message.success('授权记录已更新');
        } catch (e) {
          setError(e);
          throw e;
        }
      },
    });
  }
  const erase = useMutation({
    mutationFn: api.eraseData,
    onSuccess: () => {
      clear();
      queryClient.clear();
      navigate('/login', { replace: true });
      void message.success('个人数据删除请求已提交，后端将清理相关记录与媒体');
    },
  });
  return (
    <div>
      <PageHeading
        eyebrow="YOUR SPACE. YOUR CONTROL."
        title="个人中心"
        description="管理你的账号、授权与数据，安心开始每一次练习。"
      />
      <p className="muted mono" aria-label="用户 UID">
        UID {user?.uid || '—'}
      </p>
      <VipUpgradeCard />
      <div className="profile-layout">
        <div className="profile-main">
          <details className="panel profile-disclosure profile-card">
            <summary className="profile-disclosure-summary">
              <span className="profile-disclosure-icon">
                <UserRound size={18} />
              </span>
              <span className="profile-disclosure-title">
                <strong>基本信息</strong>
                <small>
                  {user?.nickname} · {mode === 'demo' ? '演示账号' : user?.email ? '邮箱账号' : '开发账号'}
                </small>
              </span>
              <span className="profile-disclosure-action">修改</span>
              <ChevronDown className="profile-disclosure-chevron" size={18} />
            </summary>
            <div className="profile-disclosure-content">
              <div className="profile-identity">
                <VipAvatar className="avatar large">
                  {user?.system_avatar_key ? (
                    <SystemAvatar avatarKey={user.system_avatar_key} label="我的系统头像" />
                  ) : user?.avatar_url ? (
                    <img src={signedUrl(user.avatar_url)} alt="我的头像" />
                  ) : (
                    user?.nickname.slice(0, 1)
                  )}
                </VipAvatar>
                <div>
                  <h3>{user?.nickname}</h3>
                  <p>
                    加入于{' '}
                    {user && dateText(user.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
              >
                <label className="field">
                  你的称呼
                  <input
                    required
                    maxLength={80}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </label>
                <button
                  className="btn primary small"
                  disabled={save.isPending || !nickname.trim() || nickname === user?.nickname}
                >
                  <Save size={14} />
                  保存修改
                </button>
              </form>
              {save.isError && <ErrorState error={save.error} />}
            </div>
          </details>
          <AccountSettings />
          <details className="panel profile-disclosure consents-panel">
            <summary className="profile-disclosure-summary">
              <span className="profile-disclosure-icon">
                <ShieldCheck size={18} />
              </span>
              <span className="profile-disclosure-title">
                <strong>隐私与授权</strong>
                <small>查看和修改内容使用授权 · 政策 V{consents.data?.policy_version || '—'}</small>
              </span>
              <span className="profile-disclosure-action">管理</span>
              <ChevronDown className="profile-disclosure-chevron" size={18} />
            </summary>
            <div className="profile-disclosure-content">
              {consents.isPending ? (
                <Loading />
              ) : consents.isError ? (
                <ErrorState error={consents.error} retry={() => void consents.refetch()} />
              ) : (
                (
                  Object.entries(consentLabels) as [ConsentKind, { title: string; description: string }][]
                ).map(([kind, label]) => {
                  const active = consents.data?.items.some(
                    (c) =>
                      c.consent_type === kind &&
                      !c.revoked_at &&
                      c.policy_version === consents.data.policy_version,
                  );
                  return (
                    <div className="consent-row" key={kind}>
                      <span className={`consent-status ${active ? 'granted' : ''}`}>
                        {active ? <Check size={15} /> : <ShieldCheck size={15} />}
                      </span>
                      <div>
                        <strong>{label.title}</strong>
                        <p>{label.description}</p>
                      </div>
                      <button
                        className={`text-link ${active ? 'muted' : ''}`}
                        onClick={() => changeConsent(kind, !!active)}
                      >
                        {active ? '撤回授权' : '主动授权'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </details>
          <details className="panel profile-disclosure resume-panel">
            <summary className="profile-disclosure-summary">
              <span className="profile-disclosure-icon">
                <FileText size={18} />
              </span>
              <span className="profile-disclosure-title">
                <strong>我的简历</strong>
                <small>上传、查看和删除简历 · 面试时直接选择</small>
              </span>
              <span className="profile-disclosure-action">查看</span>
              <ChevronDown className="profile-disclosure-chevron" size={18} />
            </summary>
            <div className="profile-disclosure-content">
              <ResumeLibrary />
            </div>
          </details>
          <details className="panel profile-disclosure data-panel">
            <summary className="profile-disclosure-summary">
              <span className="profile-disclosure-icon">
                <ShieldCheck size={18} />
              </span>
              <span className="profile-disclosure-title">
                <strong>个人数据管理</strong>
                <small>导出记录或申请删除个人数据</small>
              </span>
              <span className="profile-disclosure-action">管理</span>
              <ChevronDown className="profile-disclosure-chevron" size={18} />
            </summary>
            <div className="profile-disclosure-content">
              <div className="data-action">
                <div>
                  <strong>导出个人数据</strong>
                  <p>导出账号、授权、岗位、面试问答及报告（JSON）</p>
                </div>
                <button className="btn secondary small" onClick={() => void exportData()}>
                  <Download size={14} />
                  导出数据
                </button>
              </div>
              <div className="data-action">
                <div>
                  <strong>删除全部个人数据</strong>
                  <p>删除请求不可撤销，包含岗位、简历、面试及媒体文件</p>
                </div>
                <button
                  className="btn danger-outline small"
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeletionText('');
                  }}
                >
                  <Trash2 size={14} />
                  申请删除
                </button>
              </div>
              {deleteOpen && (
                <div className="delete-confirm">
                  <label className="field">
                    输入「删除我的数据」确认此操作
                    <input
                      value={deletionText}
                      onChange={(e) => setDeletionText(e.target.value)}
                      placeholder="删除我的数据"
                    />
                  </label>
                  <div className="inline">
                    <button
                      className="btn danger small"
                      disabled={deletionText !== '删除我的数据' || erase.isPending}
                      onClick={() => erase.mutate()}
                    >
                      {erase.isPending ? '正在提交…' : '确认永久删除'}
                    </button>
                    <button className="btn secondary small" onClick={() => setDeleteOpen(false)}>
                      取消
                    </button>
                  </div>
                </div>
              )}
              {erase.isError && <ErrorState error={erase.error} />}
            </div>
          </details>
          {error !== null && <ErrorState error={error} />}
        </div>
        <aside className="profile-aside">
          <div className="panel profile-quota">
            <span className="advice-icon">
              <Sparkles size={22} />
            </span>
            <h3>准备好下一次进步</h3>
            <p>当前剩余练习次数</p>
            <div className="quota-big">
              {user?.remaining_interviews ?? '—'}
              <small> 次</small>
            </div>
            <p>
              <span>
                {user?.membership?.active
                  ? `VIP 会员 · 有效期至 ${new Date(user.membership.expires_at!).toLocaleDateString('zh-CN')}`
                  : '普通会员'}{' '}
                · <Link to="/question-bank">大厂真题实操</Link>
                <br />
              </span>
              {user?.interview_credits && (
                <>
                  {creditsText({
                    credits: user.remaining_interviews,
                    interview_credits: user.interview_credits,
                  })}
                  <br />
                </>
              )}
              每次使用对应面试类型的 1 次额度。
              <br />
              未开始的面试取消后由后端释放预占。
            </p>
            <Link className="btn primary full" to="/billing">
              <Sparkles size={16} />
              购买练习权益
            </Link>
          </div>
          <div className="profile-environment">
            <FlaskConical size={20} />
            <h3>{mode === 'demo' ? '本地演示模式' : '本地开发环境'}</h3>
            <p>
              {mode === 'demo'
                ? '演示记录仅保存于当前浏览器。演示报告不对真实能力进行评分。'
                : '连接已配置的 FastAPI。AI 是否为模拟服务以报告中的标记为准。权益可通过模拟支付购买，不产生真实扣款。'}
            </p>
            <p>网页微信扫码登录需要独立后端身份服务。</p>
          </div>
          <button className="btn secondary full" onClick={() => void logout()}>
            <LogOut size={16} />
            退出登录
          </button>
        </aside>
      </div>
    </div>
  );
}
