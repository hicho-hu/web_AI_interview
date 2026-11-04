import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  MessageSquare,
  Mic,
  Video,
  Inbox,
  RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Interview, Mode } from '../../types/domain';
import { ApiError } from '../../services/client';
import { dateText, interviewLink, modeLabels, statusLabels } from '../../utils/interview';

export function Loading({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="state-block" role="status">
      <LoaderCircle className="spin" size={28} />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={23} />
      <div>
        <strong>{error instanceof Error ? error.message : '加载失败，请重试'}</strong>
        {error instanceof ApiError && error.requestId && <small>请求编号：{error.requestId}</small>}
      </div>
      {retry && (
        <button className="btn secondary small" onClick={retry}>
          <RotateCcw size={15} />
          重试
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = '你的下一次进步，从这里开始',
  description = '完成第一场模拟面试，就能在这里看到你的练习记录。',
  action = true,
}: {
  title?: string;
  description?: string;
  action?: boolean;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Link className="btn secondary" to="/interviews/new">
          开始第一场面试
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function ModeIcon({ mode, size = 18 }: { mode: Mode; size?: number }) {
  const Icon = mode === 'TEXT' ? MessageSquare : mode === 'VOICE' ? Mic : Video;
  return <Icon size={size} />;
}
export function InterviewRows({ items }: { items: Interview[] }) {
  return (
    <div className="interview-table">
      <div className="table-head">
        <span>面试岗位</span>
        <span>面试模式</span>
        <span>面试时间</span>
        <span>状态 / 评分</span>
        <span />
      </div>
      {items.map((item) => (
        <Link className="interview-row" key={item.id} to={interviewLink(item)}>
          <div className="job-cell">
            <span className={`job-avatar mode-${item.mode.toLowerCase()}`}>
              <ModeIcon mode={item.mode} size={21} />
            </span>
            <div>
              <strong>{item.job_title}</strong>
              <small>
                {item.config.duration_minutes} 分钟 · {item.config.question_count} 道主问题
              </small>
            </div>
          </div>
          <span className="table-mode">{modeLabels[item.mode]}</span>
          <span className="table-date">
            {dateText(item.created_at, { year: 'numeric', month: '2-digit', day: '2-digit' })}
          </span>
          <span>
            {item.overall_score !== null ? (
              <b className="score-inline">
                {item.overall_score}
                <small> 分</small>
              </b>
            ) : (
              <span className={`status status-${item.status.toLowerCase()}`}>
                {statusLabels[item.status]}
              </span>
            )}
          </span>
          <ArrowRight className="row-arrow" size={17} />
        </Link>
      ))}
    </div>
  );
}
