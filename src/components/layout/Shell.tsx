import { creditsText } from '../../features/billing/credits';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App, Modal } from 'antd';
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Wallet,
  UsersRound,
} from 'lucide-react';
import { useSession } from '../../stores/session';
import { api, devLoginEnabled } from '../../services/api';
import { queryClient } from '../../app/query';

export function Brand() {
  return (
    <Link to="/dashboard" className="brand">
      <span className="brand-mark">
        <MessageSquare size={23} />
        <span className="brand-bars">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span>
        面试序章<small>INTERVIEW STUDIO</small>
      </span>
    </Link>
  );
}
const routes = [
  { to: '/dashboard', label: '我的工作台', icon: LayoutDashboard },
  { to: '/interviews/new', label: '开始模拟面试', icon: Sparkles },
  { to: '/history', label: '面试记录', icon: History },
  { to: '/billing', label: '我的权益', icon: Wallet },
  { to: '/invitations', label: '邀请好友', icon: UsersRound },
  { to: '/profile', label: '个人中心', icon: UserRound },
];
export default function Shell() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const { user, mode, setUser, clear } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function logout() {
    try {
      await api.logout();
    } catch {
      void message.info('已退出本地登录状态');
    }
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  }
  function connectBackend() {
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  }
  const title =
    routes.find((r) => location.pathname.startsWith(r.to))?.label ||
    (location.pathname.includes('report') ? '面试评估报告' : 'AI 面试室');
  return (
    <div className="app-shell">
      {open && <button className="sidebar-overlay" aria-label="关闭导航" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button className="icon-btn mobile-close" aria-label="关闭导航" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <Link to="/interviews/new" className="btn primary sidebar-start">
          <Plus size={19} />
          新建模拟面试
        </Link>
        <p className="nav-label">练习空间</p>
        <nav aria-label="主导航">
          {routes.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} />
              <span>{label}</span>
              {to === '/interviews/new' && <span className="new-tag">AI</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quota-card">
            <div className="quota-title">
              <span className="quota-icon">
                <Sparkles size={17} />
              </span>
              <strong>每一次练习，都更进一步</strong>
            </div>
            <p>为下一次机会，做好充分准备。</p>
            <div className="quota-amount">
              <span>剩余练习次数</span>
              <b>
                {user?.remaining_interviews ?? '—'}
                <small> 次</small>
              </b>
            </div>
            {user?.interview_credits && (
              <p className="quota-breakdown">
                {creditsText({
                  credits: user.remaining_interviews,
                  interview_credits: user.interview_credits,
                })}
                {(user.universal_interviews ?? 0) > 0 && ` · 通用 ${user.universal_interviews} 次`}
              </p>
            )}
            <Link to="/billing">
              查看我的权益
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            使用帮助
            <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-user">
            <span className="avatar">{user?.nickname?.slice(0, 1) || '我'}</span>
            <Link to="/profile">
              <strong>{user?.nickname || '求职者'}</strong>
              <small>{mode === 'demo' ? '本地演示账号' : '面试练习者'}</small>
            </Link>
            <button className="icon-btn" title="退出登录" aria-label="退出登录" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-btn menu-toggle" aria-label="打开导航" onClick={() => setOpen(true)}>
              <Menu size={21} />
            </button>
            <span>我的空间</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`environment-badge ${mode} ${mode === 'live' && me.isError ? 'connection-error' : ''}`}
              role="status"
            >
              <span />
              {mode === 'demo'
                ? '本地演示 · 未连接后端'
                : me.isError
                  ? '后端连接异常'
                  : me.isSuccess
                    ? '真实后端已连接'
                    : '正在连接后端…'}
            </span>
            <span className="topbar-separator" />
            <button className="topbar-profile" onClick={() => navigate('/profile')}>
              <span className="avatar small">{user?.nickname?.slice(0, 1)}</span>
              <span>{user?.nickname}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        {mode === 'demo' && (
          <div className="demo-ribbon">
            <FlaskConical size={14} />
            <span>当前为本地演示，不向后端发送业务请求，记录仅保存在此浏览器。</span>
            <button type="button" onClick={connectBackend}>
              {devLoginEnabled ? '连接真实后端' : '返回登录页'}
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}
        <main
          id="main-content"
          className={`main-content ${location.pathname.includes('/room') ? 'room-content' : ''}`}
        >
          <Outlet />
        </main>
        <footer className="footer">
          <span>© {new Date().getFullYear()} 面试序章 · 让每一次面试，都更有准备</span>
          <span>
            <ShieldCheck size={13} />
            你的经历，始终属于你
          </span>
        </footer>
      </div>
      <Modal
        title={
          <span className="inline">
            <BookOpen size={20} />
            开始你的面试练习
          </span>
        }
        open={help}
        onCancel={() => setHelp(false)}
        footer={
          <button className="btn primary" onClick={() => setHelp(false)}>
            我知道了
          </button>
        }
      >
        <div className="help-content">
          <p>1. 输入目标岗位和招聘 JD，可选上传 PDF / DOCX 简历。</p>
          <p>2. 选择文字、语音或视频模式，设置难度、时长和题数。</p>
          <p>3. 回答 AI 提问，可暂停和继续；结束后查看有回答证据的报告。</p>
          <p>
            演示模式可体验文字流程。本地开发登录连接已运行的 FastAPI；语音和视频需要浏览器授权和后端媒体服务。
          </p>
          <p>评分仅供训练参考，不代表招聘方评价或录用概率。</p>
        </div>
      </Modal>
    </div>
  );
}
