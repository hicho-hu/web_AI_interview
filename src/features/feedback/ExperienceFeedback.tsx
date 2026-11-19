import { useEffect, useRef, useState } from 'react';
import { Modal, Rate } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareHeart, Send, Star } from 'lucide-react';
import { request } from '../../services/client';
import { useSession } from '../../stores/session';
import { randomUUID } from '../../utils/uuid';
import { ErrorState } from '../../components/common/ui';
import '../../styles/experience-feedback.css';

const dimensions = { question_quality: '题目质量', followup_experience: '追问体验', pacing: '节奏安排', interaction: '交互流畅度', overall: '整体满意度' };
type Dimension = keyof typeof dimensions;
type Ratings = Record<Dimension, number>;
type Feedback = { id: string; ratings: Ratings; comment: string };
type Response = { feedback: Feedback | null; dimensions: Record<Dimension, string> };
const emptyRatings = (): Ratings => ({ question_quality: 0, followup_experience: 0, pacing: 0, interaction: 0, overall: 0 });

export default function ExperienceFeedback({ type, id, ready }: { type: 'INTERVIEW' | 'PRACTICE'; id: string; ready: boolean }) {
  const uid = useSession(s => s.user?.id);
  const live = useSession(s => s.mode) === 'live';
  const field = type === 'INTERVIEW' ? 'interview_id' : 'practice_session_id';
  const key = `experience-feedback:${uid}:${type}:${id}`;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['experience-feedback', uid, type, id], queryFn: () => request<Response>('GET', `/experience-feedback?${new URLSearchParams({ [field]: id })}`), enabled: live && ready && !!id });
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => { setOpen(false); setRatings(emptyRatings()); setComment(''); setSubmitted(false); setError(null); attempt.current = null; }, [key]);
  useEffect(() => {
    if (!ready || !query.isSuccess || !live) return;
    if (query.data.feedback) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(key) === 'dismissed'; } catch { /* Keep feedback optional when storage is unavailable. */ }
    if (!dismissed) setOpen(true);
  }, [ready, query.isSuccess, query.data, key, live]);
  function close() { if (busy) return; setOpen(false); try { sessionStorage.setItem(key, 'dismissed'); } catch { /* Optional feedback remains skippable. */ } }
  function edit() { setSubmitted(false); setRatings(query.data?.feedback?.ratings || emptyRatings()); setComment(query.data?.feedback?.comment || ''); setError(null); setOpen(true); }
  async function submit() {
    if (busy || !Object.values(ratings).every(value => value >= 1 && value <= 5)) return;
    const body = { [field]: id, ratings, comment: comment.trim() };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: randomUUID() };
    setBusy(true); setError(null);
    try {
      const response = await request<Response>('POST', '/experience-feedback', body, attempt.current.key);
      queryClient.setQueryData(['experience-feedback', uid, type, id], response);
      setSubmitted(true); attempt.current = null;
      try { sessionStorage.setItem(key, 'dismissed'); } catch { /* The server record also prevents duplicate auto prompts. */ }
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  if (!ready || !live) return null;
  return <div className="experience-feedback-entry no-print">
    <button type="button" className="btn secondary small" onClick={edit}><Star size={15} />{query.data?.feedback ? '查看 / 修改体验评价' : '评价本次面试体验'}</button>
    <Modal open={open} title={null} footer={null} width={560} centered closable={!busy} maskClosable={!busy} onCancel={close} destroyOnHidden>
      <div className="experience-feedback-modal"><span className="experience-feedback-icon">{submitted ? <CheckCircle2 size={29} /> : <MessageSquareHeart size={29} />}</span><h2>{submitted ? '感谢你的真实反馈' : '这次面试体验怎么样？'}</h2><p>{submitted ? '星级和文字建议已保存，帮助我们持续改进。' : '每项 1 星最低、5 星最高。评价不会影响 AI 评分或你的权益。'}</p>
        {submitted ? <button className="btn primary full" onClick={close}>完成，继续查看</button> : <>
          <div className="experience-rating-list">{Object.entries(dimensions).map(([code, label]) => <div className="experience-rating-row" role="group" aria-label={label} key={code}><strong>{label}</strong><Rate aria-label={`${label}星级`} allowClear={false} value={ratings[code as Dimension]} onChange={value => setRatings(current => ({ ...current, [code]: value }))} disabled={busy} tooltips={['很差', '较差', '一般', '满意', '非常满意']} /></div>)}</div>
          <label className="experience-comment-label" htmlFor={`experience-comment-${id}`}>文字反馈 <small>（选填）</small></label><textarea id={`experience-comment-${id}`} rows={4} maxLength={1000} value={comment} disabled={busy} onChange={event => setComment(event.target.value)} placeholder="哪里做得不错？哪些地方还可以改进？欢迎留下具体建议。" /><small className="experience-comment-count">{comment.length} / 1000</small>
          <ErrorState error={error || query.error} />
          <div className="experience-feedback-actions"><button type="button" className="btn secondary" disabled={busy} onClick={close}>稍后评价</button><button type="button" className="btn primary" disabled={busy || !Object.values(ratings).every(value => value >= 1 && value <= 5)} onClick={() => void submit()}><Send size={15} />{busy ? '正在保存…' : '提交体验评价'}</button></div>
        </>}
      </div>
    </Modal>
  </div>;
}
