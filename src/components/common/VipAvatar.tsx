import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { useSession } from '../../stores/session';
import { SystemAvatar } from './SystemAvatar';
import { signedUrl } from '../../features/media/urls';
import '../../styles/vip.css';

export default function VipAvatar({ className = 'avatar', children }: { className?: string; children?: ReactNode }) {
  const user = useSession(s => s.user);
  const active = user?.membership?.active && !!user.membership.expires_at && new Date(user.membership.expires_at).getTime() > Date.now();
  return <span className={`vip-avatar-wrap ${active ? 'has-vip' : ''}`}><span className={className}>{children ?? (user?.system_avatar_key ? <SystemAvatar avatarKey={user.system_avatar_key} label="我的头像" /> : user?.avatar_url ? <img src={signedUrl(user.avatar_url)} alt="我的头像" /> : user?.nickname?.slice(0, 1) || '我')}</span>{active && <span className="vip-avatar-corner" aria-label="VIP会员角标"><Crown size={10} /><b>VIP</b></span>}</span>;
}
