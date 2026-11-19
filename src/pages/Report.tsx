import AppSelect from '../components/common/AppSelect';
import { lazy, Suspense, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Tabs } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  Lightbulb,
  Printer,
  Quote,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { queryClient } from '../app/query';
import { ErrorState, Loading, PageHeading } from '../components/common/ui';
import { dateText, modeLabels } from '../utils/interview';
import { closingMessage } from '../features/interviews/closing';
import SessionReplay from '../components/common/SessionReplay';
import ExperienceFeedback from '../features/feedback/ExperienceFeedback';
import '../styles/interview-pages-compact.css';
import '../styles/interview-report-tabs.css';

const ScoreRadar = lazy(() =>
  import('../components/charts/Charts').then((module) => ({
    default: module.ScoreRadar,
  })),
);

export default function ReportPage() {
  const { id = '' } = useParams();
  const { modal, message } = App.useApp();
  const [tab, setTab] = useState('overview');
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [printing, setPrinting] = useState(false);
  const detail = useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.detail(id),
    refetchInterval: (query) => (query.state.data?.status === 'FINISHING' ? 1800 : false),
  });
  const result = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.report(id),
    refetchInterval: (query) => (query.state.data?.status === 'FINISHING' ? 1800 : false),
  });
  const report = result.data?.report;
  const item = detail.data;
  async function printReport() {
    try {
      await import('../components/charts/Charts');
      flushSync(() => setPrinting(true));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      window.print();
    } catch {
      void message.error('打印内容加载失败，请稍后重试。');
    } finally {
      setPrinting(false);
    }
  }
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
      await Promise.all(
        ['report', 'interview', 'history-all'].map((key) =>
          queryClient.invalidateQueries({
            queryKey: key === 'history-all' ? [key] : [key, id],
          }),
        ),
      );
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
      <div className="report-page sim-report-compact">
        <ExperienceFeedback
          type="INTERVIEW"
          id={id}
          ready={!!item && ['FINISHING', 'COMPLETED', 'REPORT_FAILED'].includes(item.status)}
        />
        <Link className="back-link" to="/history">
          <ArrowLeft size={15} />
          返回面试记录
        </Link>
        {item && ['FINISHING', 'COMPLETED', 'REPORT_FAILED'].includes(item.status) && (
          <div className="panel interview-closing" role="status">
            <strong>面试官结束语</strong>
            <p>{item.closing_message || closingMessage(item.config.language)}</p>
          </div>
        )}
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
              ? 'AI 正在分析回答、整理证据与改进建议，完成后自动显示。'
              : '报告会在面试结束后生成。'}
          </p>
          {item?.status === 'FINISHING' ? (
            <Loading label="正在生成报告…" />
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
          <ErrorState error={regenerate.error} />
        </div>
      </div>
    );

  const overview = (
    <div className="report-tab-overview">
      <section className="panel report-overview-compact">
        <div className={`score-circle ${report.overall_score === null ? 'unassessed' : ''}`}>
          <b>{report.overall_score ?? '—'}</b>
          <small>{report.overall_score === null ? '无法判断' : '/ 100 分'}</small>
        </div>
        <div className="report-overview-copy">
          <span className="section-kicker">YOUR INTERVIEW REVIEW</span>
          <h2>本次面试综合表现</h2>
          <p>{report.job_match_feedback}</p>
          <div className="report-disclaimer">
            <ShieldCheck size={14} />
            <span>{report.disclaimer}</span>
          </div>
        </div>
      </section>
      <div className="sim-report-metrics">
        {report.dimensions.map((dimension) => (
          <button type="button" key={dimension.name} onClick={() => setTab('dimensions')}>
            <span>{dimension.name}</span>
            <strong>{dimension.score ?? '—'}</strong>
          </button>
        ))}
      </div>
      {!printing && (
        <div className="report-advice-grid sim-overview-highlights">
          <section className="panel advice-panel">
            <h2>值得保持</h2>
            {report.strengths.length ? (
              <ul>
                {report.strengths.slice(0, 2).map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">目前没有足够证据归纳明确优势。</p>
            )}
          </section>
          <section className="panel advice-panel">
            <h2>优先改进</h2>
            <ul>
              {report.gaps.slice(0, 2).map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            <button className="text-link" onClick={() => setTab('advice')}>
              查看完整提升建议
              <ArrowRight size={13} />
            </button>
          </section>
        </div>
      )}
      {item && (
        <div className="panel interview-closing" role="status">
          <strong>面试官结束语</strong>
          <p>{item.closing_message || closingMessage(item.config.language)}</p>
        </div>
      )}
    </div>
  );
  const dimensions = (
    <section className="panel sim-dimensions-tab">
      <div className="panel-heading">
        <div>
          <h2>能力维度分析</h2>
          <p>评分、点评与回答证据集中展示。</p>
        </div>
      </div>
      <div className="sim-dimension-layout">
        <div className="sim-radar">
          <Suspense fallback={<Loading label="正在加载维度图…" />}>
            <ScoreRadar dimensions={report.dimensions} />
          </Suspense>
        </div>
        <div className="dimension-grid">
          {report.dimensions.map((dimension) => (
            <article className="dimension-item" key={dimension.name}>
              <div>
                <strong>{dimension.name}</strong>
                <b>
                  {dimension.score ?? '无法判断'}
                  {dimension.score !== null && <small> / 100</small>}
                </b>
              </div>
              <p>{dimension.feedback}</p>
              {dimension.evidence.length > 0 && (
                <blockquote>
                  <Quote size={13} />
                  {dimension.evidence.join('；')}
                </blockquote>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
  const turns = report.original_turns || [];
  const questionIndex = Math.min(selectedQuestion, Math.max(0, turns.length - 1));
  const questions = (
    <section className="panel reviews-panel sim-questions-tab">
      <div className="panel-heading">
        <div>
          <h2>逐题复盘</h2>
          <p>一次聚焦一道题，查看完整提问、回答和点评。</p>
        </div>
        <span className="tag">{turns.length} 轮回答</span>
      </div>
      {!!turns.length && !printing && (
        <div className="sim-question-switcher">
          <button
            className="btn secondary small"
            disabled={questionIndex === 0}
            onClick={() => setSelectedQuestion((value) => value - 1)}
          >
            <ArrowLeft size={14} />
            上一题
          </button>
          <AppSelect
            aria-label="选择复盘题目"
            value={questionIndex}
            onChange={(value) => setSelectedQuestion(Number(value))}
          >
            {turns.map((turn, index) => (
              <option key={turn.turn_id} value={index}>
                第 {index + 1} 题 · {turn.question.slice(0, 45)}
              </option>
            ))}
          </AppSelect>
          <button
            className="btn secondary small"
            disabled={questionIndex >= turns.length - 1}
            onClick={() => setSelectedQuestion((value) => value + 1)}
          >
            下一题
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      {(printing ? turns : turns.slice(questionIndex, questionIndex + 1)).map((turn, index) => {
        const review = report.reviews.find((value) => value.turn_id === turn.turn_id);
        return (
          <article className="sim-question-review" key={turn.turn_id}>
            <h3>
              <span>第 {(printing ? index : questionIndex) + 1} 题</span>
              {turn.question}
            </h3>
            <div className="original-answer">
              <span>你的回答原文</span>
              <p>{turn.answer || '本轮没有可用回答'}</p>
            </div>
            {review ? (
              <>
                <div className="review-summary">
                  <b>回答摘要</b>
                  <p>{review.summary}</p>
                </div>
                <div className="review-feedback-grid">
                  {[
                    {
                      label: '回答亮点',
                      values: review.strengths,
                      className: 'positive',
                    },
                    {
                      label: '可以更进一步',
                      values: review.weaknesses,
                      className: 'improve',
                    },
                    {
                      label: '改进建议',
                      values: review.suggestions,
                      className: 'suggestion',
                    },
                  ].map((group) => (
                    <div key={group.label} className={group.className}>
                      <strong>{group.label}</strong>
                      <ul>
                        {group.values.map((text, i) => (
                          <li key={i}>{text}</li>
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
                      {review.evidence.map((text, i) => (
                        <p key={i}>“{text}”</p>
                      ))}
                    </div>
                  </blockquote>
                )}
                <div className="reference-approach">
                  <Lightbulb size={18} />
                  <div>
                    <b>参考组织思路</b>
                    <p>{review.reference_approach}</p>
                    <small>结合自己的真实经历使用参考思路。</small>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">本轮证据不足，无法判断。</p>
            )}
          </article>
        );
      })}
      {!turns.length && (
        <div className="empty-state">
          <p>没有可用的回答证据，本次能力无法判断。</p>
        </div>
      )}
    </section>
  );
  const advice = (
    <div className="report-advice-grid sim-advice-tab">
      <section className="panel advice-panel">
        <h2>你的优势与提升空间</h2>
        {report.strengths.length > 0 && (
          <>
            <h4>继续保持</h4>
            <ul>
              {report.strengths.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </>
        )}
        <h4>值得强化</h4>
        <ul>
          {report.gaps.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      </section>
      <section className="panel advice-panel next-practice">
        <h2>下一次练习的重点</h2>
        <ul>
          {report.recommendations.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        <h4>推荐练习问题</h4>
        {report.practice_questions.map((text, index) => (
          <p className="practice-question" key={index}>
            {text}
          </p>
        ))}
      </section>
    </div>
  );
  const tabs = [
    { key: 'overview', label: '复盘概览', children: overview },
    { key: 'dimensions', label: '维度分析', children: dimensions },
    { key: 'questions', label: '逐题复盘', children: questions },
    { key: 'advice', label: '提升建议', children: advice },
    ...(item?.mode !== 'TEXT'
      ? [
          {
            key: 'replay',
            label: '面试回放',
            children: <SessionReplay interviewId={id} />,
          },
        ]
      : []),
  ];
  return (
    <div className={`report-page sim-report-compact sim-report-tabs ${printing ? 'is-printing' : ''}`}>
      <ExperienceFeedback type="INTERVIEW" id={id} ready />
      <Link className="back-link" to="/history">
        <ArrowLeft size={15} />
        返回面试记录
      </Link>
      <PageHeading
        eyebrow="EVERY ANSWER TELLS A STORY"
        title="模拟面试复盘"
        description={`${item?.job_title || '面试'} · ${item ? modeLabels[item.mode] : ''} · ${dateText(report.created_at, { year: 'numeric', month: 'long', day: 'numeric' })} · 报告 V${report.version}`}
      >
        <div className="inline no-print">
          <button className="btn secondary" onClick={() => void printReport()}>
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
            报告，用于验证流程，不代表真实能力评价。
          </span>
        </div>
      )}
      {printing ? (
        <>
          {overview}
          {dimensions}
          {questions}
          {advice}
        </>
      ) : (
        <Tabs activeKey={tab} onChange={setTab} items={tabs} className="sim-report-main-tabs" />
      )}
      <div className="report-bottom no-print">
        <span className="muted">报告结果仅用于求职训练。</span>
        <button
          className="text-link"
          disabled={regenerate.isPending}
          onClick={() =>
            modal.confirm({
              title: '重新生成报告？',
              content: '将基于本次已完成的回答生成新版本。',
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
      <ErrorState error={regenerate.error} />
    </div>
  );
}
