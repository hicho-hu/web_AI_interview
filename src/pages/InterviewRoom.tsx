import { useCallback, useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  CornerDownLeft,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { queryClient } from '../app/query';
import { ErrorState, Loading, ModeIcon } from '../components/common/ui';
import { formatClock, modeLabels, processingTurn, remainingSeconds, statusLabels } from '../utils/interview';
import Recorder from '../features/media/Recorder';
import { signedUrl } from '../features/media/upload';
import ConversationRoom from './ConversationRoom';

export default function InterviewRoom() {
  const { id = '' } = useParams();
  const detail = useQuery({ queryKey: ['interview', id], queryFn: () => api.detail(id) });
  if (detail.isPending) return <Loading label="正在恢复面试会话…" />;
  if (detail.isError || !detail.data)
    return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;
  return detail.data.mode === 'TEXT' ? <TextInterviewRoom /> : <ConversationRoom initial={detail.data} />;
}

function TextInterviewRoom() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const [answer, setAnswer] = useState('');
  const [textFallback, setTextFallback] = useState(false);
  const [dirtyMedia, setDirtyMedia] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const detail = useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.detail(id),
    refetchInterval: (q) =>
      ['COMPLETED', 'CANCELLED', 'FAILED'].includes(q.state.data?.status || '') ? false : 1500,
  });
  const item = detail.data;
  const turn = item?.current_question;
  const turns = useQuery({
    queryKey: ['turns', id],
    queryFn: () => api.turns(id),
    refetchInterval: item?.status === 'IN_PROGRESS' ? 2000 : false,
  });
  const processing = processingTurn(turn?.status);
  const currentTaskId = taskId || turn?.task_id;
  const task = useQuery({
    queryKey: ['task', currentTaskId],
    queryFn: () => api.task(currentTaskId!),
    enabled: !!currentTaskId && processing,
    refetchInterval: (q) =>
      ['COMPLETED', 'SUCCEEDED', 'FAILED'].includes(q.state.data?.status || '') ? false : 1500,
  });
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['interview', id] }),
      queryClient.invalidateQueries({ queryKey: ['turns', id] }),
      queryClient.invalidateQueries({ queryKey: ['history-all'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
  }, [id]);
  const control = useMutation({
    mutationFn: async ({ action, reason = 'USER' }: { action: string; reason?: string }) => {
      const scope = `${id}:${action}:${reason}`;
      const result = await api.action(id, action, operationKey(scope), action === 'finish' ? { reason } : {});
      completeOperation(scope);
      return result;
    },
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (e) => {
      setError(e);
      void refresh();
    },
  });
  const submit = useMutation({
    mutationFn: async (body: { text?: string; asset_id?: string; client_duration_ms?: number }) => {
      if (!turn) throw new Error('当前问题不存在');
      const scope = `answer:${turn.id}:${JSON.stringify(body)}`;
      const result = await api.submit(id, turn.id, body, operationKey(scope));
      completeOperation(scope);
      return result;
    },
    onSuccess: async (result) => {
      setTaskId(result.task_id);
      setAnswer('');
      setError(null);
      await refresh();
    },
    onError: (e) => {
      setError(e);
      void refresh();
    },
  });
  const seconds = item ? remainingSeconds(item, detail.dataUpdatedAt, now) : 0;
  const disabled =
    !item ||
    item.status !== 'IN_PROGRESS' ||
    turn?.status !== 'WAITING_ANSWER' ||
    submit.isPending ||
    control.isPending ||
    seconds === 0;
  const dirty = dirtyMedia || !!answer.trim();
  const blocker = useBlocker(
    dirty && !['COMPLETED', 'FINISHING', 'REPORT_FAILED'].includes(item?.status || ''),
  );
  useEffect(() => {
    if (blocker.state === 'blocked')
      modal.confirm({
        title: '离开面试室？',
        content: '未提交的文字和录制会丢失。已提交的回答和会话保留在服务端，可以从历史记录继续。',
        okText: '离开',
        cancelText: '继续作答',
        onOk: () => blocker.proceed(),
        onCancel: () => blocker.reset(),
      });
  }, [blocker, modal]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  useEffect(() => {
    if (item && ['COMPLETED', 'FINISHING', 'REPORT_FAILED'].includes(item.status))
      navigate(`/interviews/${id}/report`, { replace: true });
  }, [item?.status, id, navigate]);
  useEffect(() => {
    if (
      item?.status === 'IN_PROGRESS' &&
      seconds === 0 &&
      !processing &&
      turn?.status !== 'FAILED' &&
      !control.isPending &&
      !error
    ) {
      control.mutate({ action: 'finish', reason: 'TIME_LIMIT' });
    }
  }, [item?.status, seconds, processing, turn?.status, control.isPending, error]);
  useEffect(() => {
    setTaskId(null);
    setAnswer('');
    setDirtyMedia(false);
  }, [turn?.id]);
  const onDirty = useCallback((value: boolean) => setDirtyMedia(value), []);
  function finish() {
    modal.confirm({
      title: '结束本次练习并生成报告？',
      content: '未提交的回答不会计入报告。报告将根据已完成的回答生成，你可以稍后在面试记录查看。',
      okText: '结束并生成报告',
      cancelText: '继续练习',
      onOk: async () => {
        await control.mutateAsync({ action: 'finish' });
        setAnswer('');
        setDirtyMedia(false);
      },
    });
  }
  if (detail.isPending) return <Loading label="正在恢复面试会话…" />;
  if (detail.isError || !item) return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;
  if (item.status === 'CANCELLED')
    return (
      <div className="panel centered">
        <h2>本场面试已取消</h2>
        <Link className="btn primary" to="/interviews/new">
          创建新的练习
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  const completed = turns.data?.items.filter((t) => t.status === 'COMPLETED').length || 0;
  return (
    <div className="interview-room">
      <div className="room-top">
        <div>
          <Link className="back-link" to="/history">
            <ArrowLeft size={14} />
            我的面试
          </Link>
          <h1>
            {item.job_title}
            <span className="room-mode">
              <ModeIcon mode={item.mode} size={13} />
              {modeLabels[item.mode]}
            </span>
          </h1>
        </div>
        <div className="room-timer">
          <span>
            <i />
            {statusLabels[item.status]}
          </span>
          <strong className={seconds < 60 ? 'urgent' : ''}>
            <Clock3 size={19} />
            {formatClock(seconds)}
          </strong>
          <small>剩余时间</small>
        </div>
      </div>
      <div className="room-grid">
        <section className="panel interviewer-panel">
          <div className="interviewer-portrait">
            <div className="interviewer-halo">
              <AudioLines size={48} strokeWidth={1.4} />
            </div>
            <span className="interviewer-online">
              <i />
              AI 面试官
            </span>
          </div>
          <div className="interviewer-intro">
            <h3>你好，我们开始吧。</h3>
            <p>
              我会根据岗位要求提问。
              <br />
              像真实面试一样，自然地表达自己。
            </p>
          </div>
          <div className="interviewer-note">
            <ShieldCheck size={16} />
            <span>
              你的回答仅用于
              <br />
              你授权的面试训练
            </span>
          </div>
          <div className="interviewer-bottom">
            <span />
            <span />
            <span />
            <small>INTERVIEW STUDIO</small>
          </div>
        </section>
        <section className="answer-column">
          <div className="panel question-panel">
            <div className="question-label">
              <span>
                <Sparkles size={15} />
                {turn?.turn_type === 'FOLLOW_UP' ? '深入追问' : '当前问题'}
              </span>
              <small>{turn ? `第 ${turn.main_index + 1} 道主问题` : '面试准备'}</small>
            </div>
            {item.status === 'PREPARING' ? (
              <Loading label="正在分析岗位并生成专属面试问题…" />
            ) : item.status === 'FAILED' ? (
              <>
                <ErrorState error={new Error(`面试准备失败：${item.failure_code || '任务异常'}`)} />
                <button
                  className="btn primary"
                  disabled={control.isPending}
                  onClick={() => control.mutate({ action: 'retry' })}
                >
                  <RotateCcw size={16} />
                  重试准备
                </button>
              </>
            ) : (
              <>
                <h2 className="question-text">{turn?.question || '问题正在准备中…'}</h2>
                <div className="question-meta">
                  <span className="tag">{turn?.competency || '岗位综合能力'}</span>
                  {turn?.question_audio?.download_url ? (
                    <audio
                      controls
                      src={signedUrl(turn.question_audio.download_url)}
                      aria-label="播放 AI 提问"
                    />
                  ) : (
                    <small>
                      <Volume2 size={13} />
                      {item.mode === 'TEXT' ? '请用你自己的经历作答' : '本题暂无提问音频，请阅读文字'}
                    </small>
                  )}
                </div>
              </>
            )}
          </div>
          {error !== null && <ErrorState error={error} />}
          {item.status === 'READY' ? (
            <div className="panel ready-panel">
              <span className="ready-icon">
                <Check size={28} />
              </span>
              <h2>你的专属面试已准备就绪</h2>
              <p>
                {item.config.question_count} 道主问题 · {item.config.duration_minutes} 分钟
                <br />
                点击开始后计时并扣除 1 次练习额度
              </p>
              <button
                className="btn primary"
                disabled={control.isPending}
                onClick={() => control.mutate({ action: 'start' })}
              >
                <Play size={16} />
                正式开始面试
              </button>
            </div>
          ) : item.status === 'PAUSED' ? (
            <div className="panel ready-panel">
              <Pause size={32} className="muted" />
              <h2>稍作休息，也是一种准备</h2>
              <p>计时已暂停，已提交回答会保留。</p>
              <button
                className="btn primary"
                disabled={control.isPending}
                onClick={() => control.mutate({ action: 'resume' })}
              >
                <Play size={16} />
                继续面试
              </button>
            </div>
          ) : (
            item.status === 'IN_PROGRESS' && (
              <div className="panel answer-panel">
                <div className="answer-heading">
                  <h3>
                    <MessageSquare size={17} />
                    你的回答
                  </h3>
                  {item.mode !== 'TEXT' && (
                    <button
                      disabled={dirtyMedia}
                      className="text-link"
                      onClick={() => setTextFallback(!textFallback)}
                    >
                      {textFallback ? '使用录制回答' : '改用文字回答'}
                    </button>
                  )}
                </div>
                {processing ? (
                  <div className="processing-state">
                    <LoaderCircle size={30} className="spin" />
                    <h3>
                      {turn?.status === 'TRANSCRIBING' ? '正在转写你的回答' : 'AI 正在认真分析你的回答'}
                    </h3>
                    <p>请稍候，处理完成后会自动进入下一题。</p>
                    <small>刷新页面后也能恢复处理进度</small>
                    {task.isError && <ErrorState error={task.error} retry={() => void task.refetch()} />}
                  </div>
                ) : turn?.status === 'FAILED' || task.data?.status === 'FAILED' ? (
                  <div className="processing-state">
                    <ErrorState
                      error={new Error(`回答处理失败：${task.data?.error_code || '请重试处理任务'}`)}
                    />
                    <button
                      className="btn primary"
                      onClick={async () => {
                        try {
                          if (turn?.task_id) await api.retryTask(turn.task_id);
                          await refresh();
                          await task.refetch();
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    >
                      <RotateCcw size={16} />
                      重试处理
                    </button>
                  </div>
                ) : item.mode === 'TEXT' || textFallback ? (
                  <>
                    <textarea
                      aria-label="你的面试回答"
                      rows={9}
                      maxLength={20000}
                      disabled={disabled}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && answer.trim() && !disabled) {
                          e.preventDefault();
                          submit.mutate({ text: answer.trim() });
                        }
                      }}
                      placeholder="从背景、任务、你的具体行动和结果说起。无需追求完美，真实表达就很好。"
                    />
                    <div className="answer-footer">
                      <span>
                        {answer.length.toLocaleString()} / 20,000
                        <small>
                          <CornerDownLeft size={12} />⌘ / Ctrl + Enter 提交
                        </small>
                      </span>
                      <button
                        className="btn primary"
                        disabled={disabled || !answer.trim()}
                        onClick={() => submit.mutate({ text: answer.trim() })}
                      >
                        {submit.isPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                        提交回答
                      </button>
                    </div>
                  </>
                ) : (
                  <Recorder
                    key={turn?.id}
                    mode={item.mode}
                    interviewId={id}
                    turnId={turn!.id}
                    disabled={disabled}
                    onDirty={onDirty}
                    onUploaded={async (assetId, duration) => {
                      await submit.mutateAsync({ asset_id: assetId, client_duration_ms: duration });
                    }}
                  />
                )}
              </div>
            )
          )}
          {!!completed && (
            <div className="panel transcript-panel">
              <button className="transcript-toggle" onClick={() => setShowTranscript(!showTranscript)}>
                <span>
                  <Check size={15} />
                  已完成 {completed} 轮回答
                </span>
                <ChevronDown size={17} className={showTranscript ? 'rotated' : ''} />
              </button>
              {showTranscript &&
                turns.data?.items
                  .filter((t) => t.status === 'COMPLETED')
                  .map((t) => (
                    <div className="past-turn" key={t.id}>
                      <strong>
                        Q{t.turn_no} · {t.question}
                      </strong>
                      <p>{t.transcript || '暂无转写文本'}</p>
                    </div>
                  ))}
            </div>
          )}
        </section>
        <aside className="room-right">
          <section className="panel progress-panel">
            <h3>
              本次练习进度
              <span>
                {Math.min((turn?.main_index || 0) + 1, item.config.question_count)} /{' '}
                {item.config.question_count}
              </span>
            </h3>
            <div className="progress-track">
              <i
                style={{
                  width: `${Math.min(100, ((turn?.main_index || 0) / item.config.question_count) * 100)}%`,
                }}
              />
            </div>
            <ol>
              {Array.from({ length: item.config.question_count }, (_, i) => (
                <li
                  key={i}
                  className={
                    i < (turn?.main_index || 0) ? 'done' : i === (turn?.main_index || 0) ? 'current' : ''
                  }
                >
                  <span>
                    {i < (turn?.main_index || 0) ? <Check size={12} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>主问题 {i + 1}</strong>
                    <small>
                      {i < (turn?.main_index || 0)
                        ? '已完成'
                        : i === (turn?.main_index || 0)
                          ? turn?.competency || '待开始'
                          : '等待你的回答'}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <div className="room-tip">
            <Lightbulb size={20} />
            <h3>给自己一点思考的时间</h3>
            <p>先理清思路，再展开表达。说清楚你做了什么，比描述整个团队更重要。</p>
          </div>
          {['IN_PROGRESS', 'PAUSED'].includes(item.status) && (
            <div className="room-controls">
              <button
                className="btn secondary full"
                disabled={control.isPending || processing || dirtyMedia}
                onClick={() => control.mutate({ action: item.status === 'PAUSED' ? 'resume' : 'pause' })}
              >
                {item.status === 'PAUSED' ? <Play size={15} /> : <Pause size={15} />}
                {item.status === 'PAUSED' ? '继续面试' : '暂停面试'}
              </button>
              <button
                className="btn ghost full"
                disabled={control.isPending || processing || turn?.status === 'FAILED'}
                onClick={finish}
              >
                <Square size={13} />
                结束并生成报告
              </button>
            </div>
          )}
          {turns.isError && <ErrorState error={turns.error} retry={() => void turns.refetch()} />}
        </aside>
      </div>
      <div className="room-footer-note">
        <ShieldCheck size={13} />
        真实表达，安心练习。AI 反馈仅供求职训练参考。
      </div>
    </div>
  );
}
