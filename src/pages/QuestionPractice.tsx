import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Mic,
  Send,
  Target,
  RotateCcw,
  LoaderCircle,
  Square,
} from 'lucide-react';
import { PageHeading, ErrorState, Loading } from '../components/common/ui';
import Recorder from '../features/media/Recorder';
import PracticeConversation from '../features/questions/PracticeConversation';
import PracticeReview from '../features/questions/PracticeReview';
import { practiceApi } from '../services/practice';
import { ApiError, completeOperation, operationKey } from '../services/client';
import { VipUpgradeModal } from '../features/billing/VipUpgrade';
import { randomUUID } from '../utils/uuid';
import { useSession } from '../stores/session';
import type { PracticeSession } from '../features/questions/types';
import '../styles/question-practice.css';
import ExperienceFeedback from '../features/feedback/ExperienceFeedback';
import {
  appendPracticeTranscript,
  MAX_PRACTICE_ANSWER_LENGTH,
} from '../features/questions/answer';

export default function QuestionPractice() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const uid = useSession((s) => s.user?.id);
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['practice-session', uid, id],
    queryFn: () => practiceApi.session(id),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === 'FINISHING' ? 1500 : false,
  });
  const row = session.data;
  const current = row?.rounds.find((round) => round.answer === null);
  const [text, setText] = useState('');
  const textRef = useRef('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [vipOpen, setVipOpen] = useState(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const noDirty = useCallback((_value: boolean) => {}, []);
  useEffect(() => {
    setText('');
    textRef.current = '';
    setVoiceOpen(false);
    setVoiceTranscript('');
    setVoiceError(null);
    attempt.current = null;
  }, [id, current?.round_no]);
  async function accept(result: PracticeSession) {
    queryClient.setQueryData(['practice-session', uid, id], result);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['practice-history', uid] }),
      queryClient.invalidateQueries({ queryKey: ['practice-quota', uid] }),
    ]);
  }
  function changeText(value: string) {
    textRef.current = value;
    setText(value);
  }
  async function submit(endSession = false) {
    if (busy || !current || !text.trim()) return;
    const body = {
      round_no: current.round_no,
      text: text.trim(),
      mode: 'TEXT' as const,
      end_session: endSession,
    };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: randomUUID() };
    setBusy(endSession ? 'finish' : 'answer');
    setError(null);
    try {
      await accept(await practiceApi.answer(id, body, attempt.current.key));
      attempt.current = null;
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy('');
    }
  }
  async function finish() {
    if (busy) return;
    if (current && text.trim()) {
      await submit(true);
      return;
    }
    if (!row?.rounds.some((round) => round.answer)) return;
    const scope = `practice-finish:${uid}:${id}`;
    setBusy('finish');
    setError(null);
    try {
      await accept(await practiceApi.finish(id, operationKey(scope)));
      completeOperation(scope);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy('');
    }
  }
  function appendVoice(transcript: string) {
    changeText(appendPracticeTranscript(textRef.current, transcript));
    setVoiceTranscript('');
    setVoiceError(null);
    setVoiceOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  async function transcribe(assetId: string) {
    if (!current) return;
    const scope = `practice-asr:${uid}:${id}:${assetId}`;
    setBusy('asr');
    setError(null);
    try {
      const result = await practiceApi.transcribe(
        id,
        current.round_no,
        assetId,
        operationKey(scope),
      );
      completeOperation(scope);
      setVoiceTranscript(result.text);
      appendVoice(result.text);
    } catch (failure) {
      setVoiceError(failure);
      throw failure;
    } finally {
      setBusy('');
    }
  }
  async function again() {
    if (!row || !row.position_code) {
      navigate('/question-bank');
      return;
    }
    const scope = `practice-again:${uid}:${id}`;
    setBusy('again');
    setError(null);
    try {
      const next = await practiceApi.start(
        row.company_id,
        row.question_id,
        row.position_code,
        operationKey(scope),
        true,
      );
      completeOperation(scope);
      await queryClient.invalidateQueries({
        queryKey: ['practice-history', uid],
      });
      navigate(`/question-bank/practice/${next.id}`);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        ['QUESTION_VIP_REQUIRED', 'QUESTION_UNLOCK_REQUIRED'].includes(
          failure.code,
        )
      )
        setVipOpen(true);
      else setError(failure);
    } finally {
      setBusy('');
    }
  }
  async function reportAction(kind: 'retry' | 'regenerate') {
    const scope = `practice-report-${kind}:${uid}:${id}`;
    setBusy(kind);
    setError(null);
    try {
      await accept(
        await (kind === 'retry'
          ? practiceApi.retryReport(id, operationKey(scope))
          : practiceApi.regenerateReport(id, operationKey(scope))),
      );
      completeOperation(scope);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy('');
    }
  }
  return (
    <div
      className={`question-practice-page ${row?.report ? 'has-review' : ''}`}
    >
      <Link to="/question-bank" className="practice-back">
        <ArrowLeft size={16} />
        返回公司题库
      </Link>
      <PageHeading
        eyebrow="ONE QUESTION, DEEPER UNDERSTANDING"
        title={row ? `${row.company.name} · 真题实操` : '真题实操'}
        description="从独立作答到深入追问，再用有证据的反馈找到下一步。"
      />
      <ErrorState error={error || session.error} />
      <VipUpgradeModal open={vipOpen} onClose={() => setVipOpen(false)} />
      <ExperienceFeedback
        type="PRACTICE"
        id={id}
        ready={
          !!row &&
          ['FINISHING', 'COMPLETED', 'REPORT_FAILED'].includes(row.status)
        }
      />
      {session.isLoading ? (
        <Loading label="正在打开你的实操练习…" />
      ) : (
        row && (
          <>
            <section className="panel practice-original-question">
              <span className="practice-kicker">
                <Target size={16} />
                本次面试题
              </span>
              <h2>{row.question.question_text}</h2>
              <div className="practice-original-meta">
                <span>最多 {row.max_rounds} 轮 · 首问及追问</span>
              </div>
            </section>
            {row.report && (
              <PracticeReview
                row={row}
                sessionId={id}
                busy={busy}
                onAgain={() => void again()}
                onRegenerate={() => void reportAction('regenerate')}
              />
            )}
            <div
              className={`practice-room-grid ${row.status !== 'IN_PROGRESS' ? 'is-ended' : ''}`}
            >
              <section
                className={`panel practice-dialogue ${row.status !== 'IN_PROGRESS' ? 'is-ended' : ''}`}
                aria-label="单题作答与追问"
              >
                {row.status === 'IN_PROGRESS' ? (
                  <>
                    <div className="practice-list-heading">
                      <h2>和 AI 面试官过一遍</h2>
                      <span>
                        已回答{' '}
                        {row.rounds.filter((round) => round.answer).length} /{' '}
                        {row.max_rounds} 轮
                      </span>
                    </div>
                    <PracticeConversation
                      sessionId={id}
                      rounds={row.rounds}
                      suspended={voiceOpen || !!busy}
                    />
                  </>
                ) : (
                  <details className="practice-conversation-history">
                    <summary>
                      <span>查看本次作答记录</span>
                      <small>
                        已回答{' '}
                        {row.rounds.filter((round) => round.answer).length} 轮
                      </small>
                    </summary>
                    <PracticeConversation
                      sessionId={id}
                      rounds={row.rounds}
                      suspended={!!busy}
                    />
                  </details>
                )}
                {row.status === 'IN_PROGRESS' && current && (
                  <div className="practice-answer-box">
                    <label
                      className="practice-input-label"
                      htmlFor="practice-answer"
                    >
                      第 {current.round_no} 轮回答
                    </label>
                    <div className="practice-editor">
                      <textarea
                        ref={inputRef}
                        id="practice-answer"
                        value={text}
                        disabled={!!busy || voiceUploading}
                        maxLength={MAX_PRACTICE_ANSWER_LENGTH}
                        rows={8}
                        onChange={(event) => changeText(event.target.value)}
                        placeholder="先说你的理解，再说明方案、取舍和验证方法。也可以点击右下角麦克风，将语音转成文字后编辑。"
                      />
                      {row.voice_enabled && (
                        <button
                          type="button"
                          className="practice-voice-trigger"
                          aria-label="语音输入"
                          title="录音并转成文字"
                          disabled={!!busy || voiceUploading}
                          onClick={() => setVoiceOpen(true)}
                        >
                          <Mic size={21} />
                        </button>
                      )}
                    </div>
                    <div className="practice-answer-footer">
                      <span>
                        {text.length} / {MAX_PRACTICE_ANSWER_LENGTH}
                      </span>
                      <div className="practice-answer-actions">
                        <button
                          className="btn primary"
                          disabled={!!busy || voiceUploading || !text.trim()}
                          onClick={() => void submit()}
                        >
                          <Send size={16} />
                          {busy === 'answer'
                            ? 'AI 正在处理…'
                            : current.round_no >= row.max_rounds
                              ? '提交并查看评分'
                              : '提交，继续追问'}
                        </button>
                        <button
                          className="btn practice-end-answer"
                          disabled={
                            !!busy ||
                            voiceUploading ||
                            (!text.trim() &&
                              !row.rounds.some((round) => round.answer))
                          }
                          onClick={() => void finish()}
                        >
                          <Square size={14} fill="currentColor" />
                          {busy === 'finish' ? '正在保存…' : '结束作答'}
                        </button>
                      </div>
                    </div>
                    <p className="practice-answer-hint">
                      结束作答会保存输入框中的当前回答，并生成复盘报告。
                    </p>
                    <Modal
                      open={voiceOpen}
                      title="语音输入"
                      footer={null}
                      width={560}
                      centered
                      destroyOnHidden
                      closable={!voiceUploading && busy !== 'asr'}
                      maskClosable={!voiceUploading && busy !== 'asr'}
                      onCancel={() => setVoiceOpen(false)}
                    >
                      <p className="practice-voice-description">
                        停止录制后自动转成文字，追加到回答末尾，你可以继续修改后再提交。
                      </p>
                      {voiceTranscript ? (
                        <div className="practice-voice-overflow">
                          <ErrorState error={voiceError} />
                          <label htmlFor="practice-voice-transcript">
                            已保留的语音转写
                          </label>
                          <textarea
                            id="practice-voice-transcript"
                            readOnly
                            value={voiceTranscript}
                            rows={6}
                          />
                          <p>可先关闭此窗口，精简原有回答后再追加。</p>
                          <button
                            className="btn primary"
                            disabled={
                              (
                                text +
                                (text && !text.endsWith('\n') ? '\n' : '') +
                                voiceTranscript.trim()
                              ).length > MAX_PRACTICE_ANSWER_LENGTH
                            }
                            onClick={() => appendVoice(voiceTranscript)}
                          >
                            追加到回答
                          </button>
                        </div>
                      ) : (
                        <Recorder
                          key={current.round_no}
                          mode="VOICE"
                          practiceId={id}
                          turnId={`${id}-${current.round_no}`}
                          disabled={busy === 'asr'}
                          onDirty={noDirty}
                          onUploaded={transcribe}
                          autoUpload
                          onUploadingChange={setVoiceUploading}
                        />
                      )}
                      {busy === 'asr' && (
                        <p className="practice-processing" role="status">
                          正在转成文字，完成后自动追加到回答。
                        </p>
                      )}
                    </Modal>
                    {!!busy && (
                      <p className="practice-processing" role="status">
                        {busy === 'asr'
                          ? '正在将录音转成文字…'
                          : busy === 'finish'
                            ? '正在保存回答并安排复盘…'
                            : 'AI 正在根据你的实际回答进行分析，请稍候。'}
                      </p>
                    )}
                  </div>
                )}
              </section>
              {row.status === 'IN_PROGRESS' && (
                <aside className="practice-guide panel">
                  <span className="practice-guide-icon">
                    <Lightbulb size={24} />
                  </span>
                  <h3>把思路讲给面试官听</h3>
                  <ol>
                    <li>先解释问题和关键约束。</li>
                    <li>给出方案，并说明为什么。</li>
                    <li>补充边界、取舍与验证结果。</li>
                  </ol>
                  <p>
                    AI 会围绕你的回答追问，最多共 {row.max_rounds}{' '}
                    轮。点击输入框右下角麦克风，即可录音转成文字。
                  </p>
                  <Link to="/question-bank">
                    看看其他公司的题
                    <ArrowRight size={14} />
                  </Link>
                </aside>
              )}
            </div>
            {row.status === 'FINISHING' && (
              <div className="practice-report-progress" role="status">
                <LoaderCircle size={27} className="spin" />
                <div>
                  <h3>回答已保存，正在生成你的复盘</h3>
                  <p>
                    {row.report_task?.status === 'RETRYING'
                      ? 'AI 服务短暂繁忙，正在自动重试。'
                      : 'AI 正在整理六维评分、回答证据和改进建议。'}
                    你可以离开页面，稍后在实操记录中查看。
                  </p>
                </div>
              </div>
            )}
            {row.status === 'REPORT_FAILED' && (
              <div className="practice-report-progress is-failed" role="alert">
                <RotateCcw size={25} />
                <div>
                  <h3>复盘暂未生成，回答已完整保留</h3>
                  <p>稍后重试即可，不需要重新作答，也不会重复扣解锁次数。</p>
                </div>
                <button
                  className="btn secondary"
                  disabled={!!busy}
                  onClick={() => void reportAction('retry')}
                >
                  重试生成复盘
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
