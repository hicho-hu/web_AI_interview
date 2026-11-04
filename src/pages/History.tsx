import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App, Pagination } from 'antd';
import { CalendarDays, ChevronLeft, Filter, Plus, Search, Trash2, TrendingUp } from 'lucide-react';
import { api } from '../services/api';
import { queryClient } from '../app/query';
import { Empty, ErrorState, InterviewRows, Loading, PageHeading } from '../components/common/ui';
import { statusLabels } from '../utils/interview';
const TrendChart = lazy(() => import('../components/charts/Charts').then((m) => ({ default: m.TrendChart })));

export default function History() {
  const history = useQuery({ queryKey: ['history-all'], queryFn: api.allHistory });
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const { modal, message } = App.useApp();
  const all = history.data || [];
  const filtered = useMemo(
    () =>
      all.filter(
        (i) =>
          i.job_title.toLowerCase().includes(search.toLowerCase()) &&
          (!mode || i.mode === mode) &&
          (!status || i.status === status) &&
          (!from || i.created_at.slice(0, 10) >= from) &&
          (!to || i.created_at.slice(0, 10) <= to),
      ),
    [all, search, mode, status, from, to],
  );
  const items = filtered.slice((page - 1) * 8, page * 8);
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
    <div>
      <PageHeading
        eyebrow="YOUR PRACTICE JOURNAL"
        title="让每一次练习，都留下进步的线索"
        description="回顾表达，积累经验。下一场面试的底气，就藏在这些练习里。"
      >
        <Link className="btn primary" to="/interviews/new">
          <Plus size={17} />
          开始新面试
        </Link>
      </PageHeading>
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
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>
              全部面试记录 <span className="count-label">{all.length}</span>
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
          <select
            aria-label="筛选面试模式"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部模式</option>
            <option value="TEXT">文字面试</option>
            <option value="VOICE">语音面试</option>
            <option value="VIDEO">视频面试</option>
          </select>
          <select
            aria-label="筛选面试状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([v, t]) => (
              <option value={v} key={v}>
                {t}
              </option>
            ))}
          </select>
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
            <InterviewRows items={items} />
            <div className="delete-column">
              <span />
              {items.map((i) => (
                <button
                  key={i.id}
                  className="icon-btn delete-record"
                  aria-label={`删除 ${i.job_title} 面试`}
                  title="删除面试"
                  disabled={deleting}
                  onClick={() => remove(i.id, i.job_title)}
                >
                  <Trash2 size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="history-pagination">
          <span>共 {filtered.length} 条记录</span>
          <Pagination
            current={page}
            pageSize={8}
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
    </div>
  );
}
