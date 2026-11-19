import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, RotateCcw } from 'lucide-react';
import QuestionExplanation from './QuestionExplanation';
import type { PracticeSession } from './types';
import '../../styles/practice-review-compact.css';

export default function PracticeReview({
  row,
  sessionId,
  busy,
  onAgain,
  onRegenerate,
}: {
  row: PracticeSession;
  sessionId: string;
  busy: string;
  onAgain: () => void;
  onRegenerate: () => void;
}) {
  const report = row.report;
  if (!report) return null;
  return (
    <section
      className="panel practice-report practice-review-compact"
      aria-label="单题多维评分报告"
    >
      <div className="review-compact-heading">
        <div>
          <span className="practice-kicker">YOUR PRACTICE REVIEW</span>
          <h2>这道题，你答得怎么样</h2>
          <p>评分依据本次作答，点击各维度可查看点评与证据。</p>
        </div>
        <div className="review-compact-score">
          <strong>{report.overall_score ?? '—'}</strong>
          <span>
            {report.overall_score === null ? '暂无法评分' : '/ 100 综合评分'}
          </span>
        </div>
        <QuestionExplanation sessionId={sessionId} prominent />
      </div>
      <div className="review-score-grid">
        {report.dimensions.map((dimension) => (
          <article className="review-score-card" key={dimension.name}>
            <div>
              <h3>{dimension.name}</h3>
              <b>{dimension.score ?? '无法评价'}</b>
            </div>
            <div className="review-score-bar">
              <i style={{ width: `${dimension.score ?? 0}%` }} />
            </div>
            <details>
              <summary>
                点评与证据
                <ChevronDown size={12} />
              </summary>
              <p>{dimension.feedback}</p>
              {dimension.evidence.map((quote, index) => (
                <blockquote key={index}>“{quote}”</blockquote>
              ))}
            </details>
          </article>
        ))}
      </div>
      <div className="review-highlights">
        {[
          {
            title: '回答优点',
            items: report.strengths,
            tone: 'strengths',
            empty: '目前没有足够证据归纳明确优点。',
          },
          {
            title: '有待加强',
            items: report.weaknesses,
            tone: 'weaknesses',
            empty: '目前没有可归纳的明确不足。',
          },
        ].map((group) => (
          <article className={group.tone} key={group.title}>
            <h3>{group.title}</h3>
            {group.items.length ? (
              <ul>
                {group.items.slice(0, 2).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>{group.empty}</p>
            )}
            {group.items.length > 2 && (
              <details>
                <summary>
                  查看其余 {group.items.length - 2} 条<ChevronDown size={12} />
                </summary>
                <ul>
                  {group.items.slice(2).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
      <details className="review-improvement">
        <summary>
          改进建议与答题思路
          <ChevronDown size={15} />
        </summary>
        <ol>
          {report.suggestions.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
        <h4>参考答题思路</h4>
        <p>{report.reference_approach}</p>
      </details>
      <div className="review-compact-footer">
        <p>{report.disclaimer}</p>
        <div>
          <button
            className="btn secondary small"
            disabled={!!busy || row.status === 'FINISHING'}
            onClick={onAgain}
          >
            <RotateCcw size={14} />
            {busy === 'again' ? '正在开始…' : '再次作答'}
          </button>
          <Link
            className="btn secondary small"
            to={`/question-bank?company=${row.company_id}&position=${row.position_code || ''}`}
          >
            继续练习
            <ArrowRight size={14} />
          </Link>
          <button
            className="text-link"
            disabled={!!busy || row.status !== 'COMPLETED'}
            onClick={onRegenerate}
          >
            <RotateCcw size={13} />
            重新生成复盘
          </button>
        </div>
      </div>
    </section>
  );
}
