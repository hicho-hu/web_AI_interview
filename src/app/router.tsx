import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './query';
import { useSession } from '../stores/session';
import Shell from '../components/layout/Shell';
import { ErrorState, Loading } from '../components/common/ui';
import { useMobileViewport } from './useMobileViewport';

const Login = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const NewInterview = lazy(() => import('../pages/NewInterview'));
const Room = lazy(() => import('../pages/InterviewRoom'));
const Report = lazy(() => import('../pages/Report'));
const History = lazy(() => import('../pages/History'));
const Profile = lazy(() => import('../pages/Profile'));
const Billing = lazy(() => import('../pages/Billing'));
const Invitations = lazy(() => import('../pages/Invitations'));
function Protected() {
  const token = useSession((s) => s.token);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Deliberately exclude personal data from logs. */
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <ErrorState error={new Error('页面加载遇到了问题，请重新加载')} />
        <button className="btn primary" onClick={() => window.location.reload()}>
          重新加载页面
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Login /> },
  {
    element: <Protected />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/interviews/new', element: <NewInterview /> },
          { path: '/interviews/:id/room', element: <Room /> },
          { path: '/interviews/:id/report', element: <Report /> },
          { path: '/history', element: <History /> },
          { path: '/profile', element: <Profile /> },
          { path: '/billing', element: <Billing /> },
          { path: '/invitations', element: <Invitations /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
export default function Application() {
  useMobileViewport();
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              colorPrimary: '#3d65ec',
              borderRadius: 10,
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
            },
          }}
        >
          <App>
            <a className="skip-link" href="#main-content">
              跳到主要内容
            </a>
            <Suspense fallback={<Loading label="正在打开面试序章…" />}>
              <RouterProvider router={router} />
            </Suspense>
          </App>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
