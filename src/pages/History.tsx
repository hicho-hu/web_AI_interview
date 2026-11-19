import AppSelect from '../components/common/AppSelect';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App, Pagination, Tabs } from 'antd';
import { CalendarDays, ChevronLeft, Filter, Plus, Search, TrendingUp } from 'lucide-react';
import { api } from '../services/api';
import { queryClient } from '../app/query';
import { Empty, ErrorState, InterviewRows, Loading, PageHeading } from '../components/common/ui';
import { statusLabels } from '../utils/interview';
import '../styles/interview-pages-compact.css';
const TrendChart = lazy(() =>
  import('../components/charts/Charts').then((m) => ({
    default: m.TrendChart,
  })),
);

export default function History() {
  const history = useQuery({
    queryKey: ['history-all'],
    queryFn: api.allHistory,
  });
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState('all');
  const { modal, message } = App.useApp();
  const all = history.data || [];
  const filtered = useMemo(
    () =>
      all.filter(
        (i) =>
          (tab !== 'completed' || i.status === 'COMPLETED') &&
          (tab !== 'active' || !['COMPLETED', 'CANCELLED'].includes(i.status)) &&
          i.job_title.toLowerCase().includes(search.toLowerCase()) &&
          (!mode || i.mode === mode) &&
          (!status || i.status === status) &&
          (!from || i.created_at.slice(0, 10) >= from) &&
          (!to || i.created_at.slice(0, 10) <= to),
      ),
    [all, search, mode, status, from, to, tab],
  );
  const items = filtered.slice((page - 1) * 6, page * 6);
  function remove(id: string, title: string) {
    modal.confirm({
      title: '删除这场面试？',
      content: `「${title}」的回答、媒体与报告将被删除，无法恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '保留记录',
      onOk: async () => {
        setDeleting(true);
        try {
          await api.deleteInterview(id);
          await queryClient.invalidateQueries({ queryKey: ['history-all'] });
          void queryClient.invalidateQueries({ queryKey: ['me'] });
          setPage(1);
          void message.success('面试数据删除已提交');
        } catch (e) {
          void message.error(e instanceof Error ? e.message : '删除失败');
          throw e;
        } finally {
          setDeleting(false);
        }
      },
    });
  }
  return (
    <div className="history-page history-compact">
      <PageHeading
        eyebrow="YOUR PRACTICE JOURNAL"
        title="模拟面试记录"
        description="查看状态与评分，继续未完成的面试，或打开报告复盘。"
      >
        <Link className="btn primary" to="/interviews/new">
          <Plus size={17} />
          开始新面试
        </Link>
      </PageHeading>
      <Tabs
        activeKey={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
          setStatus('');
        }}
        items={[
          { key: 'all', label: `全部记录 (${all.length})` },
          {
            key: 'active',
            label: `未完成 (${all.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length})`,
          },
          {
            key: 'completed',
            label: `已完成 (${all.filter((item) => item.status === 'COMPLETED').length})`,
          },
          { key: 'trend', label: '成长趋势' },
        ]}
      />
      {tab === 'trend' ? (
        <section className="panel history-chart">
          <div className="panel-heading">
            <div>
              <h2>
                <TrendingUp size={18} />
                你的成长轨迹
              </h2>
              <p>最近 12 次有效评分，记录每一点积累</p>
            </div>
            <span className="chart-legend">
              <i />
              综合评分
            </span>
          </div>
          <Suspense fallback={<Loading />}>
            <TrendChart items={all} />
          </Suspense>
        </section>
      ) : (
        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {tab === 'active' ? '未完成的面试' : tab === 'completed' ? '已完成的面试' : '全部面试记录'}{' '}
                <span className="count-label">{filtered.length}</span>
              </h2>
              <p>你的每一次认真准备，都值得被记录</p>
            </div>
            <span className="muted inline">
              <Filter size={14} />
              按需筛选
            </span>
          </div>
          <div className="history-filters">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="搜索面试岗位"
                placeholder="搜索目标岗位"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <AppSelect
              aria-label="筛选面试模式"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setPage(1);
              }}
            >
              <option value="">全部模式</option>
              <option value="TEXT">文字面试</option>
              <option value="VOICE">语音面试</option>
              <option value="VIDEO">视频面试</option>
            </AppSelect>
            <AppSelect
              aria-label="筛选面试状态"
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([v, t]) => (
                <option value={v} key={v}>
                  {t}
                </option>
              ))}
            </AppSelect>
            <div className="date-filter">
              <CalendarDays size={15} />
              <input
                aria-label="开始日期"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
              <span>至</span>
              <input
                aria-label="结束日期"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {(search || mode || status || from || to) && (
              <button
                className="text-link"
                onClick={() => {
                  setSearch('');
                  setMode('');
                  setStatus('');
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                清除
              </button>
            )}
          </div>
          {history.isPending ? (
            <Loading />
          ) : history.isError ? (
            <ErrorState error={history.error} retry={() => void history.refetch()} />
          ) : !items.length ? (
            <Empty
              title={all.length ? '暂时没有符合条件的记录' : undefined}
              description={all.length ? '试着调整筛选条件，找回你想复盘的那场练习。' : undefined}
              action={!all.length}
            />
          ) : (
            <div className="history-rows-with-delete">
              <InterviewRows
                items={items}
                deleting={deleting}
                onRemove={(item) => remove(item.id, item.job_title)}
              />
            </div>
          )}
          <div className="history-pagination">
            <span>共 {filtered.length} 条记录</span>
            <Pagination
              current={page}
              pageSize={6}
              total={filtered.length}
              onChange={setPage}
              showSizeChanger={false}
              size="small"
            />
            <Link className="back-link" to="/dashboard">
              <ChevronLeft size={13} />
              工作台
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
