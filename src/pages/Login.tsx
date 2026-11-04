import { useState } from 'react';
import { App, Modal } from 'antd';
import {
  ArrowRight,
  AudioLines,
  Check,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEmailCode } from '../features/accounts/useEmailCode';
import type { LoginResult } from '../types/domain';
import { Brand } from '../components/layout/Shell';
import { api, devLoginEnabled } from '../services/api';
import { useSession } from '../stores/session';
import { ErrorState } from '../components/common/ui';
import { queryClient } from '../app/query';

export default function Login() {
  const location = useLocation();
  const [params] = useSearchParams();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>(
    location.pathname === '/register' ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [inviteCode, setInviteCode] = useState(params.get('invite') ?? '');
  const emailCode = useEmailCode();
  const [agreed, setAgreed] = useState(false);
  const [identity, setIdentity] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [authError, setAuthError] = useState<unknown>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  const { token, login, clear } = useSession();
  const navigate = useNavigate();
  const { message } = App.useApp();
  if (token && !busy) return <Navigate to="/dashboard" replace />;
  async function completeLogin(result: LoginResult) {
    queryClient.clear();
    login(result.access_token, result.user, 'live');
    await api.ensureConsents(['PRIVACY', 'TERMS', 'AI_PROCESSING']);
    navigate('/dashboard', { replace: true });
  }
  async function sendCode() {
    setAuthError(null);
    if (!agreed) {
      void message.warning('请先阅读并同意用户协议与隐私政策');
      return;
    }
    try {
      await emailCode.send(email, authMode === 'reset' ? 'RESET_PASSWORD' : 'REGISTER');
    } catch (e) {
      setAuthError(e);
    }
  }
  async function emailAuth() {
    if (busy) return;
    setAuthError(null);
    if (!agreed) {
      void message.warning('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (authMode !== 'login' && password !== passwordConfirmation) {
      setAuthError(new Error('两次输入的密码不一致'));
      return;
    }
    if (
      authMode !== 'login' &&
      (!emailCode.challengeId || emailCode.destination !== email.trim().toLowerCase())
    ) {
      setAuthError(new Error('请先为当前邮箱获取验证码'));
      return;
    }
    setBusy(true);
    try {
      const result =
        authMode === 'login'
          ? await api.emailLogin(email.trim(), password)
          : authMode === 'register'
            ? await api.emailRegister({
                email: email.trim(),
                password,
                nickname: registerName.trim() || '面试练习者',
                code: emailOtp,
                challenge_id: emailCode.challengeId,
                agreed: true,
                ...(inviteCode.trim() ? { invite_code: inviteCode.trim() } : {}),
                ...(params.get('promotion') ? { promotion_code: params.get('promotion')! } : {}),
              })
            : await api.resetPassword({
                email: email.trim(),
                code: emailOtp,
                challenge_id: emailCode.challengeId,
                new_password: password,
              });
      await completeLogin(result);
    } catch (e) {
      clear();
      setAuthError(e);
    } finally {
      setBusy(false);
    }
  }
  async function enter(demo: boolean) {
    if (!agreed) {
      void message.warning('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!demo && !identity.trim()) {
      void message.warning('请输入开发测试账号标识');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = demo
        ? api.demoLogin()
        : await api.login(identity.trim(), nickname.trim() || '面试练习者');
      queryClient.clear();
      login(result.access_token, result.user, demo ? 'demo' : 'live');
      await api.ensureConsents(['PRIVACY', 'TERMS', 'AI_PROCESSING']);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      clear();
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-content">
          <span className="pill">
            <Sparkles size={14} />
            你的专属 AI 面试陪练
          </span>
          <h1>
            下一次面试，
            <br />
            从容开场。
          </h1>
          <p>
            把每一次练习，变成向理想工作
            <br />
            更进一步的底气。
          </p>
          <div className="login-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="voice-disc">
              <AudioLines size={62} strokeWidth={1.3} />
            </div>
            <span className="floating-label label-one">
              <Target size={17} />
              岗位定制提问
            </span>
            <span className="floating-label label-two">
              <TrendingUp size={17} />
              看见每一步成长
            </span>
            <span className="floating-spark">✧</span>
          </div>
          <div className="login-features">
            {['真实场景练习', '有据可循的反馈', '随时开始，反复进步'].map((t) => (
              <span key={t}>
                <Check size={16} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <small className="login-copyright">INTERVIEW STUDIO · PREPARE WITH CONFIDENCE</small>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <span className="section-kicker">YOUR NEXT CHAPTER</span>
          <h2>欢迎来到面试序章</h2>
          <p className="muted">为理想的下一站，做一次充分准备。</p>
          <div className="email-auth-tabs" role="tablist" aria-label="邮箱账号">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'login'}
              onClick={() => {
                setAuthMode('login');
                setError(null);
                setAuthError(null);
              }}
            >
              邮箱登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'register'}
              onClick={() => {
                setAuthMode('register');
                setError(null);
                setAuthError(null);
              }}
            >
              注册账号
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void emailAuth();
            }}
            className="email-auth-form"
          >
            {authMode === 'reset' && <h3>找回密码</h3>}
            <label className="field">
              邮箱地址
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your@email.com"
              />
            </label>
            {authMode !== 'login' && (
              <>
                <label className="field">
                  邮箱验证码
                  <div className="email-code-row">
                    <input
                      aria-label="邮箱验证码"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(event) => setEmailOtp(event.target.value)}
                      autoComplete="one-time-code"
                    />
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={emailCode.sending || emailCode.remaining > 0 || !email.includes('@')}
                      onClick={() => void sendCode()}
                    >
                      {emailCode.sending
                        ? '正在发送…'
                        : emailCode.remaining
                          ? `${emailCode.remaining} 秒后重发`
                          : '发送验证码'}
                    </button>
                  </div>
                </label>
                {emailCode.developmentCode && (
                  <p className="email-preview-note" role="status">
                    本地邮件预览 · 验证码 <b>{emailCode.developmentCode}</b>，未发送真实邮件。
                  </p>
                )}
              </>
            )}
            <label className="field">
              {authMode === 'reset' ? '新密码' : '登录密码'}
              <input
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={authMode === 'login' ? 1 : 10}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={authMode === 'login' ? '请输入密码' : '至少 10 位'}
              />
            </label>
            {authMode !== 'login' && (
              <label className="field">
                确认密码
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                />
              </label>
            )}
            {authMode === 'register' && (
              <>
                <label className="field">
                  昵称<span className="optional">选填</span>
                  <input
                    maxLength={80}
                    autoComplete="nickname"
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                  />
                </label>
                <label className="field">
                  邀请码<span className="optional">选填</span>
                  <input
                    maxLength={24}
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                  />
                </label>
                {params.get('promotion') && <p className="muted">推广来源：{params.get('promotion')}</p>}
              </>
            )}
            <label className="agreement auth-form-agreement">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                我已阅读并同意
                <button onClick={() => setPolicy('用户协议')} type="button">
                  用户协议
                </button>
                和
                <button onClick={() => setPolicy('隐私政策')} type="button">
                  隐私政策
                </button>
                ，授权将输入内容用于 AI 面试训练。
              </span>
            </label>
            <button className="btn primary full" disabled={busy} aria-describedby="auth-submit-hint">
              {busy
                ? '正在处理…'
                : authMode === 'login'
                  ? '使用邮箱登录'
                  : authMode === 'register'
                    ? '验证邮箱并注册'
                    : '重置密码并登录'}
              <ArrowRight size={18} />
            </button>
            <p id="auth-submit-hint" className="auth-submit-hint" role="status">
              {!agreed
                ? '请先勾选同意用户协议与隐私政策。'
                : authMode !== 'login' &&
                    (!emailCode.challengeId || emailCode.destination !== email.trim().toLowerCase())
                  ? '注册或重置密码前，请先发送当前邮箱的验证码。'
                  : authMode !== 'login' && emailOtp.length !== 6
                    ? '请输入收到的 6 位邮箱验证码。'
                    : authMode !== 'login' && password !== passwordConfirmation
                      ? '请确认两次输入的密码一致。'
                      : authMode === 'login'
                        ? '填写邮箱和密码后即可登录。'
                        : '信息已就绪，提交后将验证邮箱并创建账号。'}
            </p>
            {authError !== null && <ErrorState error={authError} />}
            {authMode === 'login' && (
              <button
                className="text-link forgot-password"
                type="button"
                onClick={() => {
                  setAuthMode('reset');
                  setError(null);
                }}
              >
                忘记密码
              </button>
            )}
          </form>
          {devLoginEnabled && (
            <p className="login-divider">
              <span>本地开发入口</span>
            </p>
          )}
          {devLoginEnabled ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter(false);
              }}
            >
              <div className="dev-notice">
                <FlaskConical size={17} />
                <span>真实后端登录 · 面试记录保存到服务器</span>
              </div>
              <label className="field">
                测试账号标识
                <input
                  autoComplete="username"
                  required
                  maxLength={100}
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="例如：my-interview-account"
                />
              </label>
              <label className="field">
                你的称呼<span className="optional">选填</span>
                <input
                  autoComplete="nickname"
                  maxLength={80}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="希望面试官如何称呼你？"
                />
              </label>
              <button className="btn primary full" disabled={busy || !agreed}>
                {busy ? '正在进入…' : '进入我的练习空间'}
                <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <p className="production-login-note">使用邮箱验证码注册后，即可使用邮箱和密码登录。</p>
          )}
          <div className="login-divider">
            <span>先感受一下</span>
          </div>
          <button className="btn secondary full" disabled={busy || !agreed} onClick={() => void enter(true)}>
            <Sparkles size={17} />
            体验文字面试演示
            <ArrowRight size={17} />
          </button>
          <p className="demo-login-note">此入口只体验本地流程，不调用后端接口。</p>
          {error !== null && <ErrorState error={error} />}
          <div className="login-privacy">
            <ShieldCheck size={15} />
            仅在你授权后使用简历与面试内容
          </div>
        </div>
      </section>
      <Modal
        title={`${policy || ''} · V1.0`}
        open={!!policy}
        onCancel={() => setPolicy(null)}
        footer={
          <button className="btn primary" onClick={() => setPolicy(null)}>
            已阅读
          </button>
        }
      >
        <div className="help-content">
          <p>
            面试序章是求职训练工具。输入的岗位、简历、回答及明确授权的录音录像用于生成面试问题、转写和训练报告。
          </p>
          <p>
            训练报告由 AI
            生成，可能存在错误。评分不代表真实招聘方评价或录用概率，不根据外貌、性别、年龄等推断人格或适配度。
          </p>
          <p>
            演示内容仅存储于当前浏览器；真实账号的数据由当前配置的后端处理。你可在个人中心查询授权、撤回授权并申请删除数据。
          </p>
          <p>麦克风与摄像头将在主动录制时单独请求。请只提交你有权提供的内容，避免输入无关的敏感信息。</p>
          <p>
            此版本为本地开发和验证版本；正式发布前需要补充运营主体、联系方式、保存期限及实际 AI 供应商信息。
          </p>
        </div>
      </Modal>
    </div>
  );
}
