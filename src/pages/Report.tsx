import { lazy, Suspense, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FileCheck2,
  Lightbulb,
  Printer,
  Quote,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { queryClient } from '../app/query';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { dateText, modeLabels } from '../utils/interview';
import SessionReplay from '../components/common/SessionReplay';
const ScoreRadar = lazy(() => import('../components/charts/Charts').then((m) => ({ default: m.ScoreRadar })));

export default function ReportPage() {
  const { id = '' } = useParams();
  const { modal } = App.useApp();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  function printReport() {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  }
  const detail = useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.detail(id),
    refetchInterval: (q) => (q.state.data?.status === 'FINISHING' ? 1800 : false),
  });
  const result = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.report(id),
    refetchInterval: (q) => (q.state.data?.status === 'FINISHING' ? 1800 : false),
  });
  const report = result.data?.report;
  const item = detail.data;
  const regenerate = useMutation({
    mutationFn: async () => {
      const scope = `regenerate:${id}:${report?.version || 0}`;
      await api.action(
        id,
        item?.status === 'REPORT_FAILED' ? 'retry' : 'report/regenerate',
        operationKey(scope),
      );
      completeOperation(scope);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['report', id] }),
        queryClient.invalidateQueries({ queryKey: ['interview', id] }),
        queryClient.invalidateQueries({ queryKey: ['history-all'] }),
      ]);
    },
  });
  if (detail.isPending || result.isPending) return <Loading label="正在读取你的面试复盘…" />;
  if (detail.isError || result.isError)
    return (
      <ErrorState
        error={detail.error || result.error}
        retry={() => {
          void detail.refetch();
          void result.refetch();
        }}
      />
    );
  if (!report || item?.status === 'FINISHING')
    return (
      <div>
        <Link className="back-link" to="/history">
          <ArrowLeft size={15} />
          返回面试记录
        </Link>
        <div className="panel report-pending">
          <span className="ready-icon">
            <FileCheck2 size={31} />
          </span>
          <h1>
            {item?.status === 'REPORT_FAILED'
              ? '报告生成遇到了问题'
              : item?.status === 'FINISHING'
                ? '正在整理你的每一次表达'
                : '这场面试还没有报告'}
          </h1>
          <p>
            {item?.status === 'FINISHING'
              ? 'AI 正在分析已完成的回答，整理可追溯的证据和改进建议。你可以稍后回来查看。'
              : '报告会在面试结束后生成。'}
          </p>
          {item?.status === 'FINISHING' ? (
            <Loading label="正在生成报告，完成后自动显示…" />
          ) : item?.status === 'REPORT_FAILED' ? (
            <button
              className="btn primary"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              <RotateCcw size={16} />
              重试生成
            </button>
          ) : (
            <Link className="btn primary" to={`/interviews/${id}/room`}>
              返回面试室
              <ArrowRight size={16} />
            </Link>
          )}
          {regenerate.isError && <ErrorState error={regenerate.error} />}
        </div>
        <SessionReplay interviewId={id} />
      </div>
    );
  return (
    <div className="report-page">
      <SessionReplay interviewId={id} />
      <Link className="back-link" to="/history">
        <ArrowLeft size={15} />
        返回面试记录
      </Link>
      <PageHeading
        eyebrow="EVERY ANSWER TELLS A STORY"
        title="每一次复盘，都是下一步的起点"
        description={`${item?.job_title || '面试'} · ${item ? modeLabels[item.mode] : ''} · ${dateText(report.created_at, { year: 'numeric', month: 'long', day: 'numeric' })} · 报告 V${report.version}`}
      >
        <div className="inline no-print">
          <button className="btn secondary" onClick={printReport}>
            <Printer size={15} />
            打印报告
          </button>
          <Link className="btn primary" to="/interviews/new">
            再练一场
            <ArrowRight size={15} />
          </Link>
        </div>
      </PageHeading>
      {report.is_mock && (
        <div className="info-banner">
          <Sparkles size={17} />
          <span>
            这是{report.model === 'local-demo' ? '本地演示' : '后端模拟 AI'}
            报告，结果用于验证流程，不代表真实能力评价。
          </span>
        </div>
      )}
      <div className="report-summary-grid">
        <section className="panel report-score-panel">
          <span className="section-kicker">YOUR INTERVIEW REVIEW</span>
          <h2>本次面试综合表现</h2>
          <div className={`score-circle ${report.overall_score === null ? 'unassessed' : ''}`}>
            <b>{report.overall_score ?? '—'}</b>
            <small>{report.overall_score === null ? '无法判断' : '/ 100 分'}</small>
          </div>
          <p>{report.job_match_feedback}</p>
          <div className="report-disclaimer">
            <ShieldCheck size={15} />
            <span>{report.disclaimer}</span>
          </div>
        </section>
        <section className="panel radar-panel">
          <div className="panel-heading">
            <div>
              <h2>能力维度画像</h2>
              <p>每一个判断，都应有回答作为依据</p>
            </div>
            <span className="chart-legend">
              <i />
              本次表现
            </span>
          </div>
          <Suspense fallback={<Loading />}>
            <ScoreRadar dimensions={report.dimensions} />
          </Suspense>
        </section>
      </div>
      <section className="panel dimensions-panel">
        <div className="panel-heading">
          <div>
            <h2>把反馈说具体</h2>
            <p>六个维度，找到值得继续打磨的方向</p>
          </div>
          <Target size={20} className="muted" />
        </div>
        <div className="dimension-grid">
          {report.dimensions.map((d) => (
            <div className="dimension-item" key={d.name}>
              <div>
                <strong>{d.name}</strong>
                <b>
                  {d.score ?? '无法判断'}
                  {d.score !== null && <small> / 100</small>}
                </b>
              </div>
              <p>{d.feedback}</p>
              {d.evidence.length > 0 && (
                <blockquote>
                  <Quote size={13} />
                  {d.evidence.join('；')}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel reviews-panel">
        <div className="panel-heading">
          <div>
            <h2>回到每一道题，找到进步的线索</h2>
            <p>保留原始回答，从具体证据出发复盘</p>
          </div>
          <span className="tag">{report.reviews.length} 轮有效回答</span>
        </div>
        {report.original_turns?.map((t, i) => {
          const review = report.reviews.find((r) => r.turn_id === t.turn_id);
          const open = printing || expanded === t.turn_id;
          return (
            <div className="review-item" key={t.turn_id}>
              <button
                className="review-toggle"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : t.turn_id)}
              >
                <span className="review-number">{String(i + 1).padStart(2, '0')}</span>
                <strong>{t.question}</strong>
                <ChevronDown size={18} className={open ? 'rotated' : ''} />
              </button>
              {open && (
                <div className="review-content">
                  <div className="original-answer">
                    <span>你的回答原文</span>
                    <p>{t.answer || '本轮没有可用回答'}</p>
                  </div>
                  {review ? (
                    <>
                      <div className="review-summary">
                        <b>回答摘要</b>
                        <p>{review.summary}</p>
                      </div>
                      <div className="review-feedback-grid">
                        {[
                          { label: '回答亮点', values: review.strengths, className: 'positive' },
                          { label: '可以更进一步', values: review.weaknesses, className: 'improve' },
                          { label: '改进建议', values: review.suggestions, className: 'suggestion' },
                        ].map(({ label, values, className }) => (
                          <div key={label} className={className}>
                            <strong>{label}</strong>
                            <ul>
                              {values.map((text, j) => (
                                <li key={j}>{text}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      {!!review.evidence.length && (
                        <blockquote className="evidence">
                          <Quote size={16} />
                          <div>
                            <b>回答证据</b>
                            {review.evidence.map((e, j) => (
                              <p key={j}>“{e}”</p>
                            ))}
                          </div>
                        </blockquote>
                      )}
                      <div className="reference-approach">
                        <Lightbulb size={18} />
                        <div>
                          <b>参考组织思路</b>
                          <p>{review.reference_approach}</p>
                          <small>使用你自己的真实经历，不将示例思路当作个人事实。</small>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="muted">本轮证据不足，无法判断。</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!report.original_turns?.length && (
          <div className="empty-state">
            <p>没有可用的回答证据，本次能力无法判断。</p>
          </div>
        )}
      </section>
      <div className="report-advice-grid">
        <section className="panel advice-panel">
          <span className="advice-icon">
            <Check size={21} />
          </span>
          <h2>你的优势与提升空间</h2>
          {report.strengths.length > 0 && (
            <>
              <h4>继续保持</h4>
              <ul>
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <h4>值得强化</h4>
          <ul>
            {report.gaps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="panel advice-panel next-practice">
          <span className="advice-icon">
            <Sparkles size={21} />
          </span>
          <h2>让下一次练习，更有方向</h2>
          <ul>
            {report.recommendations.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>推荐练习问题</h4>
          {report.practice_questions.map((s, i) => (
            <p className="practice-question" key={i}>
              {s}
            </p>
          ))}
        </section>
      </div>
      <div className="report-bottom no-print">
        <span className="muted">报告结果仅用于求职训练，不代表真实招聘评价。</span>
        <button
          className="text-link"
          disabled={regenerate.isPending}
          onClick={() =>
            modal.confirm({
              title: '重新生成报告？',
              content: '将基于本次已完成的回答生成新版本。历史评分可能随报告变化。',
              okText: '重新生成',
              cancelText: '保留当前报告',
              onOk: () => regenerate.mutateAsync(),
            })
          }
        >
          <RotateCcw size={14} />
          {regenerate.isPending ? '正在请求…' : '重新生成报告'}
        </button>
      </div>
      {regenerate.isError && <ErrorState error={regenerate.error} />}
    </div>
  );
}
