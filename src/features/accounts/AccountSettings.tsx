import { useEffect, useState } from 'react';
import { App, Modal } from 'antd';
import { Camera, ChevronDown, KeyRound, Mail, Phone, Save } from 'lucide-react';
import { api } from '../../services/api';
import { useSession } from '../../stores/session';
import { queryClient } from '../../app/query';
import { ErrorState } from '../../components/common/ui';
import { SystemAvatar } from '../../components/common/SystemAvatar';
import { useEmailCode } from './useEmailCode';
import { uploadFile } from '../media/upload';
import type { LoginResult, User } from '../../types/domain';

const isValidEmail = (value: string) =>
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(value.trim());
function isValidPhone(value: string) {
  const phone = value.trim();
  if (!phone) return true;
  if (!/^\+?[0-9 ()-]+$/.test(phone)) return false;
  return /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[ ()-]/g, ''));
}
const systemAvatarOptions = [
  ...['清爽男生', '眼镜男生', '户外男生', '音乐男生'].map((label, index) => ({
    key: `avatar-${String(index + 1).padStart(2, '0')}`,
    label,
    group: 'male',
  })),
  ...['针织女生', '温柔女生', '活力女生', '文艺女生'].map((label, index) => ({
    key: `avatar-${String(index + 5).padStart(2, '0')}`,
    label,
    group: 'female',
  })),
  ...['工程师', '教师', '医生', '设计师', '厨师', '科学家', '自然研究员', '商务职场'].map((label, index) => ({
    key: `avatar-${String(index + 9).padStart(2, '0')}`,
    label,
    group: 'career',
  })),
];

async function avatarFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片');
  const bitmap = await createImageBitmap(file);
  try {
    if (Math.max(bitmap.width, bitmap.height) > 8192) throw new Error('头像图片尺寸过大');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 256, 256);
    const size = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('头像转换失败'))),
        'image/jpeg',
        0.88,
      ),
    );
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

export default function AccountSettings() {
  const { user, mode, login, setUser } = useSession();
  const { message } = App.useApp();
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.contact_phone ?? '');
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [bindingPassword, setBindingPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarFilter, setAvatarFilter] = useState('all');
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const verification = useEmailCode();
  useEffect(() => {
    setEmail(user?.email ?? '');
    setPhone(user?.contact_phone ?? '');
  }, [user?.email, user?.contact_phone]);
  function update(value: User) {
    setUser(value);
    queryClient.setQueryData(['me'], value);
  }
  function authenticated(value: LoginResult) {
    login(value.access_token, value.user, 'live');
    update(value.user);
  }
  async function perform(name: string, work: () => Promise<void>, errorGroup = name) {
    if (busy) return;
    setBusy(name);
    setErrors((current) => ({ ...current, [errorGroup]: null }));
    try {
      await work();
    } catch (value) {
      setErrors((current) => ({ ...current, [errorGroup]: value }));
    } finally {
      setBusy('');
    }
  }
  if (mode === 'demo')
    return (
      <section className="panel account-settings">
        <h2>账号安全</h2>
        <p className="muted">演示账号不绑定邮箱、不设置密码；连接真实后端后可管理账号资料。</p>
      </section>
    );
  return (
    <section className="panel account-settings">
      <div className="panel-heading account-settings-heading">
        <h2>
          <KeyRound size={18} /> 账号与安全
        </h2>
        <span className="tag">邮箱账号</span>
      </div>
      <details className="account-setting-disclosure">
        <summary>
          <Camera size={17} />
          <span>
            <strong>个人头像</strong>
            <small>更换头像图片</small>
          </span>
          <span className="account-setting-action">修改</span>
          <ChevronDown className="profile-disclosure-chevron" size={17} />
        </summary>
        <div className="account-setting-group">
          <p className="muted">头像会裁为正方形，仅用于展示账号资料。</p>
          <div className="account-avatar-preview">
            {user?.system_avatar_key ? (
              <SystemAvatar avatarKey={user.system_avatar_key} label="当前系统头像" />
            ) : user?.avatar_url ? (
              <img src={user.avatar_url} alt="当前头像" />
            ) : (
              <span className="account-avatar-initial">{user?.nickname.slice(0, 1)}</span>
            )}
            <div>
              <strong>选择一张喜欢的头像</strong>
              <small>可爱人物与职业主题，随时可以更换</small>
            </div>
          </div>
          <button
            type="button"
            className="btn secondary small"
            disabled={!!busy}
            onClick={() => setAvatarPickerOpen(true)}
          >
            <Camera size={14} /> 选择系统头像
          </button>
          <label className={`btn secondary small ${busy ? 'disabled' : ''}`}>
            {busy === 'avatar' ? `正在上传 ${avatarProgress}%` : '修改头像'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              disabled={!!busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file)
                  void perform('avatar', async () => {
                    const image = await avatarFile(file);
                    const ticket = await uploadFile(
                      image,
                      {
                        filename: image.name,
                        content_type: image.type,
                        size: image.size,
                        media_type: 'AVATAR',
                      },
                      setAvatarProgress,
                    );
                    update(await api.updateAvatar(ticket.asset_id));
                    void message.success('头像已更新');
                  });
              }}
            />
          </label>
          {errors.avatar != null && <ErrorState error={errors.avatar} />}
        </div>
      </details>
      <details className="account-setting-disclosure">
        <summary>
          <Mail size={17} />
          <span>
            <strong>邮箱</strong>
            <small>{user?.email || '尚未绑定邮箱'}</small>
          </span>
          <span className="account-setting-action">修改</span>
          <ChevronDown className="profile-disclosure-chevron" size={17} />
        </summary>
        <form
          className="account-setting-group account-setting-form"
          onSubmit={(event) => {
            event.preventDefault();
            void perform('email', async () => {
              if (!verification.challengeId || verification.destination !== email.trim().toLowerCase())
                throw new Error('请先为当前邮箱获取验证码');
              authenticated(
                await api.bindEmail({
                  email,
                  code,
                  challenge_id: verification.challengeId,
                  ...(user?.has_password
                    ? { current_password: currentPassword }
                    : { new_password: bindingPassword }),
                }),
              );
              setCode('');
              setCurrentPassword('');
              setBindingPassword('');
              void message.success('邮箱已验证并保存，其他登录状态已失效');
            });
          }}
        >
          <p className="muted">
            {user?.email ? `当前邮箱：${user.email}` : '验证邮箱并设置密码后，即可使用邮箱登录。'}
          </p>
          <label className="field">
            {user?.email ? '新邮箱地址' : '绑定邮箱地址'}
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            绑定邮箱验证码
            <div className="email-code-row">
              <input
                aria-label="绑定邮箱验证码"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button
                type="button"
                className="btn secondary small"
                disabled={!!busy || verification.sending || verification.remaining > 0}
                onClick={() =>
                  void perform(
                    'code',
                    async () => {
                      if (!isValidEmail(email)) throw new Error('请输入格式正确的邮箱地址');
                      await verification.send(email, 'REGISTER', true);
                    },
                    'email',
                  )
                }
              >
                {verification.remaining ? `${verification.remaining} 秒后重发` : '发送验证码'}
              </button>
            </div>
          </label>
          {verification.developmentCode && (
            <p className="email-preview-note">
              本地邮件预览 · 验证码 <b>{verification.developmentCode}</b>，未发送真实邮件。
            </p>
          )}
          {user?.has_password ? (
            <label className="field">
              确认当前密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
          ) : (
            <label className="field">
              设置登录密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={bindingPassword}
                onChange={(event) => setBindingPassword(event.target.value)}
              />
            </label>
          )}
          <button className="btn primary small" disabled={!!busy}>
            <Save size={15} />
            {busy === 'email' ? '正在验证…' : '验证并保存邮箱'}
          </button>
          {errors.email != null && <ErrorState error={errors.email} />}
        </form>
      </details>
      {user?.has_password && (
        <details className="account-setting-disclosure">
          <summary>
            <KeyRound size={17} />
            <span>
              <strong>登录密码</strong>
              <small>已设置 · 定期更新密码保护账号</small>
            </span>
            <span className="account-setting-action">修改</span>
            <ChevronDown className="profile-disclosure-chevron" size={17} />
          </summary>
          <form
            className="account-setting-group account-setting-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform('password', async () => {
                if (newPassword !== confirmPassword) throw new Error('两次新密码不一致');
                authenticated(await api.changePassword(currentPassword, newPassword));
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                void message.success('密码已修改，其他登录状态已失效');
              });
            }}
          >
            <label className="field">
              原密码
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="field">
              新密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className="field">
              再次确认新密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <button className="btn primary small" disabled={!!busy}>
              <KeyRound size={15} />
              保存新密码
            </button>
            {errors.password != null && <ErrorState error={errors.password} />}
          </form>
        </details>
      )}
      <details className="account-setting-disclosure">
        <summary>
          <Phone size={17} />
          <span>
            <strong>联系手机号</strong>
            <small>{phone || '尚未填写'}</small>
          </span>
          <span className="account-setting-action">修改</span>
          <ChevronDown className="profile-disclosure-chevron" size={17} />
        </summary>
        <form
          className="account-setting-group account-setting-form"
          onSubmit={(event) => {
            event.preventDefault();
            void perform('phone', async () => {
              if (!isValidPhone(phone)) throw new Error('请输入 7 至 15 位有效手机号，可带国家区号');
              update(await api.updateContact(phone));
              void message.success('联系手机号已保存');
            });
          }}
        >
          <p className="muted">仅作为可选联系信息，尚未认证，不用于登录或验证身份。</p>
          <label className="field">
            联系手机号
            <input
              type="tel"
              maxLength={24}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <button className="btn secondary small" disabled={!!busy}>
            保存联系信息
          </button>
          {errors.phone != null && <ErrorState error={errors.phone} />}
        </form>
      </details>
      <Modal
        title="选择系统头像"
        open={avatarPickerOpen}
        onCancel={() => setAvatarPickerOpen(false)}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <p className="system-avatar-intro">挑选一张喜欢的头像，应用到你的个人资料。</p>
        <div className="system-avatar-filters" role="group" aria-label="头像分类">
          {(
            [
              ['all', '全部'],
              ['male', '男生'],
              ['female', '女生'],
              ['career', '职业主题'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={avatarFilter === value ? 'active' : ''}
              onClick={() => setAvatarFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="system-avatar-grid">
          {systemAvatarOptions
            .filter((item) => avatarFilter === 'all' || item.group === avatarFilter)
            .map((item) => (
              <button
                type="button"
                key={item.key}
                className={`system-avatar-choice ${user?.system_avatar_key === item.key ? 'selected' : ''}`}
                aria-pressed={user?.system_avatar_key === item.key}
                disabled={!!busy}
                onClick={() =>
                  void perform('avatar', async () => {
                    update(await api.updateSystemAvatar(item.key));
                    setAvatarPickerOpen(false);
                    void message.success('系统头像已更新');
                  })
                }
              >
                <SystemAvatar avatarKey={item.key} label={item.label} />
                <span>{item.label}</span>
              </button>
            ))}
        </div>
        {errors.avatar != null && <ErrorState error={errors.avatar} />}
      </Modal>
    </section>
  );
}
