import InterviewScene from '../features/media/InterviewScene';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import {
  ArrowLeft,
  AudioLines,
  Check,
  Clock3,
  Headphones,
  LoaderCircle,
  Mic,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { queryClient } from '../app/query';
import { useSession } from '../stores/session';
import { ConversationCapture, type CaptureResult } from '../features/media/ConversationCapture';
import { joinUtterances, Pcm16Encoder, wavBlob, type Utterance } from '../features/media/voiceActivity';
import {
  LiveTranscription,
  streamAnswer,
  type AnswerEvent,
  type LiveTranscript,
} from '../features/media/liveTransport';
import { captionsVtt, type CaptionCue } from '../features/media/captions';
import { recordingStore } from '../features/media/recordingStore';
import { uploadFile } from '../features/media/upload';
import { uploadSession } from '../features/media/sessionUpload';
import SessionReplay from '../components/common/SessionReplay';
import { ErrorState, Loading, ModeIcon } from '../components/common/ui';
import { formatClock, modeLabels, processingTurn, remainingSeconds } from '../utils/interview';
import type { Interview, Turn } from '../types/domain';

type Phase =
  | 'idle'
  | 'preparing'
  | 'questioning'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'paused'
  | 'saving'
  | 'stopped';
interface PendingAnswer {
  id: string;
  turnId: string;
  blob: Blob;
  duration: number;
  parts: Utterance[];
  revision: number;
  committed: boolean;
  assetId?: string;
  liveTranscript?: Promise<LiveTranscript | null>;
}
const labels: Record<Phase, string> = {
  idle: '准备开启连续面试',
  preparing: '正在准备录制设备',
  questioning: '面试官正在提问 · 开口即可打断',
  listening: '面试官正在听你说 · 停顿后自动继续',
  speaking: '正在聆听你的回答',
  processing: '正在分析回答 · 整场录制持续进行',
  paused: '对话已暂停 · 整场录制持续进行',
  saving: '正在保存整场面试',
  stopped: '本次录制已结束',
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ConversationRoom({ initial }: { initial: Interview }) {
  const id = initial.id,
    mode = initial.mode === 'VIDEO' ? 'VIDEO' : 'VOICE';
  const userId = useSession((s) => s.user!.id);
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [active, setActive] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const [recordedFrom, setRecordedFrom] = useState(0);
  const [progress, setProgress] = useState(0);
  const [archive, setArchive] = useState<CaptureResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [pausing, setPausing] = useState(false);
  const [subtitle, setSubtitle] = useState<CaptionCue | null>(null);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [captionFallback, setCaptionFallback] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);
  const sendingTurn = useRef('');
  const streamedTurn = useRef('');
  const confirmedTurns = useRef(new Set(initial.current_question ? [initial.current_question.id] : []));
  const suppressedAudio = useRef(new Set<string>());
  const live = useRef<{ channel?: LiveTranscription; encoder: Pcm16Encoder | null; cue: CaptionCue } | null>(
    null,
  );
  const capture = useRef<ConversationCapture | null>(null);
  const [scene, setScene] = useState<HTMLCanvasElement | null>(null);
  const itemRef = useRef(initial);
  const sending = useRef(false);
  const pending = useRef<PendingAnswer | null>(null);
  const submission = useRef<Promise<void>>(Promise.resolve());
  const closing = useRef(false);
  const savedResult = useRef<CaptureResult | null>(null);
  const allowLeave = useRef(false);
  const spoken = useRef('');
  const operation = useRef<((value: Utterance, transcript?: Promise<LiveTranscript | null>) => void) | null>(
    null,
  );
  const captureEnded = useRef<() => void>(() => undefined);
  const memoryAtRisk = () => {
    const result = savedResult.current;
    return (
      !!result &&
      !result.persisted &&
      (!result.session.uploadedAudioId ||
        (!!result.video && !result.session.uploadedVideoId) ||
        (!!result.captions && !result.session.uploadedCaptionsId))
    );
  };
  const detail = useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.detail(id),
    initialData: initial,
    refetchInterval: (q) =>
      streamingRef.current ||
      ['COMPLETED', 'CANCELLED', 'FAILED', 'REPORT_FAILED'].includes(q.state.data?.status || '')
        ? false
        : 1500,
  });
  const item = detail.data;
  itemRef.current = item;
  const turn = item.current_question;
  const turns = useQuery({
    queryKey: ['turns', id],
    queryFn: () => api.turns(id),
    refetchInterval: active ? 2000 : false,
  });
  const taskId = turn?.task_id || (item.status === 'PREPARING' ? item.prepare_task_id : null);
  const task = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.task(taskId!),
    enabled: !!taskId && (processingTurn(turn?.status) || turn?.status === 'FAILED'),
    refetchInterval: (q) =>
      q.state.data?.status === 'FAILED' || q.state.data?.status === 'SUCCEEDED' ? false : 1500,
  });
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['interview', id] }),
      queryClient.invalidateQueries({ queryKey: ['turns', id] }),
      queryClient.invalidateQueries({ queryKey: ['history-all'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
  }, [id]);
  const blocker = useBlocker(
    () =>
      !allowLeave.current &&
      (capture.current?.active === true || closing.current || phase === 'preparing' || memoryAtRisk()),
  );
  useEffect(() => {
    if (blocker.state === 'blocked')
      modal.confirm({
        title: '结束录制并离开？',
        content: '离开会中断实时对话。将先保存已录下的整场内容，并暂停面试；继续时需要重新授权录制。',
        okText: '保存并离开',
        cancelText: '继续面试',
        onOk: async () => {
          if (await stopSession(false, true)) blocker.proceed();
          else throw new Error('整场录制尚未安全保存，请先处理保存错误');
        },
        onCancel: () => blocker.reset(),
      });
  }, [blocker, modal]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (capture.current?.active || closing.current || memoryAtRisk()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', beforeUnload);
      live.current?.channel?.dispose();
      const current = capture.current;
      if (current?.active) void current.stop(true).catch(() => current.dispose());
      else current?.dispose();
    };
  }, []);
  async function sendAnswer(answer: PendingAnswer) {
    sending.current = true;
    sendingTurn.current = answer.turnId;
    if (!closing.current) setPhase('processing');
    setError(null);
    try {
      // The microphone remains available while uploading. If the candidate resumes,
      // wait for their next pause and upload the complete answer before committing it.
      while (!answer.committed) {
        await capture.current?.waitForSilence();
        const version = answer.revision;
        if (!answer.assetId) {
          const ticket = await uploadFile(
            answer.blob,
            {
              filename: `speech-${answer.id}.wav`,
              content_type: 'audio/wav',
              media_type: 'AUDIO',
              size: answer.blob.size,
              duration_ms: Math.round(answer.duration),
              interview_id: id,
              turn_id: answer.turnId,
            },
            () => undefined,
          );
          if (version === answer.revision) answer.assetId = ticket.asset_id;
        }
        await capture.current?.waitForSilence();
        if (version !== answer.revision) continue;
        answer.committed = true;
      }
      if (capture.current) capture.current.listening = false;
      if (!closing.current) setPhase('processing');
      const scope = `conversation-answer:${answer.id}`;
      const transcript = answer.liveTranscript
        ? await Promise.race([answer.liveTranscript, sleep(350).then(() => null)])
        : null;
      const body = {
        asset_id: answer.assetId,
        client_duration_ms: Math.round(answer.duration),
        ...(transcript ? { live_transcript_id: transcript.transcriptId } : {}),
      };
      if (itemRef.current.conversation_features?.streaming_answers) {
        streamingRef.current = true;
        setStreaming(true);
        await queryClient.cancelQueries({ queryKey: ['interview', id] });
        let receivedAudio = false;
        await streamAnswer(id, answer.turnId, body, operationKey(scope), (event: AnswerEvent) => {
          const current = capture.current;
          if (!current) return;
          if (event.type === 'transcript' && event.text) current.finalizeCandidate(answer.turnId, event.text);
          if (!current.active || closing.current) return;
          if (event.type === 'question' && event.turn_id && event.text) {
            const next: Turn = {
              id: event.turn_id,
              question: event.text,
              turn_no: event.turn_no!,
              main_index: event.main_index!,
              turn_type: event.turn_type!,
              competency: event.competency!,
              status: 'WAITING_ANSWER',
              transcript: null,
              task_id: null,
              question_audio: null,
              answer_media: null,
              parent_turn_id: answer.turnId,
            };
            streamedTurn.current = next.id;
            spoken.current = next.id;
            receivedAudio = false;
            if (pending.current === answer) pending.current = null;
            const updated = { ...itemRef.current, current_question: next, current_turn_no: next.turn_no };
            itemRef.current = updated;
            queryClient.setQueryData(['interview', id], updated);
            current.listening = true;
          } else if (
            event.type === 'audio_reset' &&
            event.turn_id &&
            !suppressedAudio.current.has(event.turn_id)
          ) {
            current.beginAudioStream();
          } else if (
            event.type === 'audio' &&
            event.pcm &&
            event.turn_id &&
            !suppressedAudio.current.has(event.turn_id)
          ) {
            if (!receivedAudio) {
              receivedAudio = true;
              setPhase('questioning');
            }
            current.appendAudio(event.pcm, event.sample_rate!);
          } else if (
            event.type === 'audio_end' &&
            event.turn_id &&
            receivedAudio &&
            !suppressedAudio.current.has(event.turn_id)
          ) {
            current.finishAudioStream();
          } else if ((event.type === 'complete' || event.type === 'deferred') && event.interview) {
            if (event.interview.current_question)
              confirmedTurns.current.add(event.interview.current_question.id);
            itemRef.current = event.interview;
            queryClient.setQueryData(['interview', id], event.interview);
            if (!receivedAudio && !suppressedAudio.current.has(event.interview.current_question?.id || ''))
              spoken.current = '';
          }
        });
      } else await api.submit(id, answer.turnId, body, operationKey(scope));
      completeOperation(scope);
      if (pending.current === answer) pending.current = null;
      // Do not make the next question wait for unrelated history/account requests.
      void refresh();
    } catch (e) {
      if (streamingRef.current) {
        capture.current?.interrupt();
        spoken.current = '';
      }
      const latest = await api.detail(id).catch(() => null);
      if (
        latest &&
        (latest.current_question?.id !== answer.turnId ||
          latest.current_question?.status !== 'WAITING_ANSWER')
      ) {
        if (pending.current === answer) pending.current = null;
        await refresh();
      } else {
        setError(e);
        throw e;
      }
    } finally {
      sending.current = false;
      streamingRef.current = false;
      setStreaming(false);
      if (!closing.current && capture.current && pending.current && !answer.committed)
        capture.current.listening = true;
      setRevision((n) => n + 1);
    }
  }
  operation.current = (value, transcript) => {
    if (closing.current) return;
    if (pending.current) {
      if (pending.current.committed) return;
      const answer = pending.current;
      answer.parts.push(value);
      const combined = joinUtterances(answer.parts);
      answer.blob = wavBlob(combined.samples, combined.sampleRate);
      answer.duration = combined.durationMs;
      answer.revision++;
      answer.assetId = undefined;
      answer.liveTranscript = undefined;
      return;
    }
    const question = itemRef.current.current_question;
    if (
      !question ||
      question.status !== 'WAITING_ANSWER' ||
      (sending.current && question.id === sendingTurn.current) ||
      closing.current
    )
      return;
    const answer = {
      id: crypto.randomUUID(),
      turnId: question.id,
      blob: wavBlob(value.samples, value.sampleRate),
      duration: value.durationMs,
      parts: [value],
      revision: 0,
      committed: false,
      liveTranscript: transcript,
    };
    pending.current = answer;
    submission.current = sending.current
      ? submission.current.then(async () => {
          for (let i = 0; !confirmedTurns.current.has(answer.turnId) && i < 100; i++) {
            const latest = await api.detail(id);
            if (latest.current_question?.id === answer.turnId) {
              confirmedTurns.current.add(answer.turnId);
              break;
            }
            if (
              latest.current_question?.status === 'FAILED' ||
              latest.current_question?.status === 'WAITING_ANSWER'
            ) {
              if (pending.current === answer) pending.current = null;
              const problem = new Error(
                '追问生成曾中断，请根据当前问题重新回答；刚才的声音已保留在整场录制中。',
              );
              setError(problem);
              spoken.current = '';
              setRevision((n) => n + 1);
              throw problem;
            }
            await sleep(300);
          }
          if (!confirmedTurns.current.has(answer.turnId))
            throw new Error('追问确认超时，请重试；整场录制仍在保留。');
          await sendAnswer(answer);
        })
      : sendAnswer(answer);
    void submission.current.catch(() => undefined);
  };
  async function speak(question: Turn, replay = false) {
    if (capture.current?.speaking) return;
    if (!capture.current?.active || closing.current || itemRef.current.status !== 'IN_PROGRESS') return;
    if (!replay && spoken.current === question.id) return;
    spoken.current = question.id;
    suppressedAudio.current.delete(question.id);
    setError(null);
    setPhase('questioning');
    capture.current.listening = true;
    try {
      let media = question.question_audio;
      if (replay && media?.id) media = await api.media(media.id);
      if (!media?.download_url)
        throw new Error('后端尚未提供本题语音。请检查 TTS 服务后重试播放；全程录制和回答收音仍会保留。');
      await capture.current.playQuestion(media.download_url);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (!capture.current?.active || closing.current) return;
      setPhase('listening');
      setError(e);
    }
  }
  useEffect(() => {
    if (!active || closing.current || !capture.current?.active) return;
    if (pausing) return;
    if (item.status === 'PAUSED') {
      capture.current.listening = false;
      capture.current.interrupt();
      setPhase('paused');
      return;
    }
    if (
      sending.current &&
      ((pending.current && !pending.current.committed) || turn?.id === streamedTurn.current)
    )
      return;
    if (processingTurn(turn?.status) || sending.current || turn?.status === 'FAILED') {
      capture.current.listening = false;
      setPhase('processing');
      return;
    }
    if (item.status === 'IN_PROGRESS' && turn?.status === 'WAITING_ANSWER') {
      capture.current.listening = true;
      if (!pending.current && spoken.current !== turn.id) void speak(turn);
    }
  }, [active, item.status, turn?.id, turn?.status, revision, pausing, streaming]);
  useEffect(() => {
    if (capture.current) capture.current.showCaptions = captionsVisible;
  }, [captionsVisible]);
  useEffect(() => {
    for (const completed of turns.data?.items || [])
      if (completed.transcript) capture.current?.finalizeCandidate(completed.id, completed.transcript);
  }, [turns.data]);
  async function start() {
    if (!agreed || phase === 'preparing') return;
    setError(null);
    setPhase('preparing');
    closing.current = false;
    allowLeave.current = false;
    spoken.current = '';
    suppressedAudio.current.clear();
    streamedTurn.current = '';
    savedResult.current = null;
    setArchive(null);
    const current = new ConversationCapture(userId, id, mode, {
      onSpeechStart: () => {
        setPhase('speaking');
        live.current?.channel?.dispose();
        const question = itemRef.current.current_question;
        if (!question || closing.current) return;
        suppressedAudio.current.add(question.id);
        const cue: CaptionCue = {
          id: `candidate:${question.id}:${crypto.randomUUID()}`,
          speaker: 'candidate',
          text: '',
          startMs: Math.max(0, current.elapsedMs - 300),
          endMs: current.elapsedMs,
          final: false,
        };
        const state: NonNullable<typeof live.current> = { encoder: null, cue };
        live.current = state;
        current.caption(cue);
        if (itemRef.current.conversation_features?.live_transcription)
          state.channel = new LiveTranscription(
            id,
            question.id,
            (text, final) => current.caption({ ...state.cue, text, final }),
            () => setCaptionFallback(true),
          );
      },
      onMicrophoneFrame: (frame, sampleRate) => {
        const state = live.current;
        if (!state) return;
        state.encoder ||= new Pcm16Encoder(sampleRate);
        state.channel?.push(state.encoder.push(frame));
        state.cue.endMs = current.elapsedMs;
      },
      onUtterance: (value) => {
        const state = live.current;
        live.current = null;
        operation.current?.(value, state?.channel?.finish());
      },
      onSpeechDiscarded: () => {
        live.current?.channel?.dispose();
        live.current = null;
        if (!closing.current) setPhase('listening');
      },
      onQuestionStarted: (durationMs) => {
        const question = itemRef.current.current_question;
        if (question)
          current.caption({
            id: `question:${question.id}`,
            speaker: 'interviewer',
            text: question.question,
            startMs: current.elapsedMs,
            endMs: current.elapsedMs + durationMs,
            final: true,
          });
      },
      onCaption: (cue) => {
        setSubtitle(cue);
        if (cue.speaker === 'candidate' && cue.text && !cue.final) setCaptionFallback(false);
      },
      onQuestionEnded: () => {
        if (!closing.current) setPhase('listening');
      },
      onError: setError,
      onCaptureEnded: () => captureEnded.current(),
    });
    capture.current = current;
    current.showCaptions = captionsVisible;
    try {
      await current.prepare();
      await api.ensureConsents(mode === 'VIDEO' ? ['MICROPHONE', 'CAMERA'] : ['MICROPHONE']);
      // Start both archives before starting the server interview clock or playing a question.
      await current.start();
      if (itemRef.current.status === 'READY') await api.action(id, 'start');
      else if (itemRef.current.status === 'PAUSED') await api.action(id, 'resume');
      setRecordedFrom(Date.now());
      setActive(true);
      setPhase('listening');
      setScene(current.scene);
      await refresh();
    } catch (e) {
      if (current.active) {
        const result = await current.stop(true);
        savedResult.current = result;
        setArchive(result);
      } else current.dispose();
      if (!savedResult.current) capture.current = null;
      setActive(false);
      setPhase('idle');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? new Error('未获得录制授权。请允许麦克风和摄像头后重新开始。')
          : e,
      );
    }
  }
  async function stopSession(end: boolean, interrupted = false, reason = 'USER') {
    if (closing.current) return false;
    const current = capture.current;
    if (!current) return false;
    if (!current.active && !savedResult.current) {
      current.dispose();
      capture.current = null;
      setPhase('idle');
      return true;
    }
    current.flushSpeech();
    live.current?.channel?.dispose();
    live.current = null;
    closing.current = true;
    current.listening = false;
    current.interrupt();
    setPhase('saving');
    setError(null);
    try {
      const result = savedResult.current || (await current.stop(interrupted));
      savedResult.current = result;
      setArchive(result);
      setActive(false);
      if (pending.current && !sending.current) submission.current = sendAnswer(pending.current);
      await submission.current;
      let latest = await api.detail(id);
      for (let i = 0; processingTurn(latest.current_question?.status) && i < 90; i++) {
        await sleep(1000);
        latest = await api.detail(id);
      }
      if (processingTurn(latest.current_question?.status) || latest.current_question?.status === 'FAILED')
        throw new Error('最后一段回答尚未处理完成。整场记录已保留，请重试处理后再生成报告。');
      const finalTurns = await api.turns(id);
      for (const completed of finalTurns.items)
        if (completed.transcript) current.finalizeCandidate(completed.id, completed.transcript);
      result.captions = result.session.captions?.length ? captionsVtt(result.session.captions) : undefined;
      await recordingStore.save(result.session).catch(() => undefined);
      let uploaded = false;
      try {
        await uploadSession(result, setProgress);
        uploaded = true;
        await queryClient.invalidateQueries({ queryKey: ['session-media', id] });
      } catch (e) {
        setError(
          new Error(
            `整场记录已保存在当前浏览器，后端保存失败：${e instanceof Error ? e.message : '请稍后重试'}`,
          ),
        );
      }
      if (!result.persisted && !uploaded)
        throw new Error('本地备份与后端保存均未成功，请先下载录制文件，保持本页面打开。');
      if (end) {
        if (['IN_PROGRESS', 'PAUSED'].includes(latest.status)) {
          const scope = `conversation-finish:${id}:${reason}`;
          await api.action(id, 'finish', operationKey(scope), { reason });
          completeOperation(scope);
        }
        setPhase('stopped');
        closing.current = false;
        allowLeave.current = true;
        await refresh();
        navigate(`/interviews/${id}/report`, { replace: true });
      } else {
        if (itemRef.current.status === 'IN_PROGRESS') await api.action(id, 'pause');
        setPhase('stopped');
        closing.current = false;
        await refresh();
        setRevision((n) => n + 1);
      }
      return true;
    } catch (e) {
      setError(e);
      setPhase('stopped');
      setActive(false);
      closing.current = false;
      return false;
    }
  }
  captureEnded.current = () => {
    setError(new Error('麦克风或摄像头已结束，正在保存中断前的录制。'));
    void stopSession(false, true);
  };
  const seconds = remainingSeconds(item, detail.dataUpdatedAt, now);
  useEffect(() => {
    if (
      active &&
      !closing.current &&
      (['FINISHING', 'COMPLETED', 'REPORT_FAILED', 'CANCELLED'].includes(item.status) || seconds === 0)
    )
      void stopSession(true, false, seconds === 0 ? 'TIME_LIMIT' : 'USER');
    else if (!active && !capture.current && ['FINISHING', 'COMPLETED', 'REPORT_FAILED'].includes(item.status))
      navigate(`/interviews/${id}/report`, { replace: true });
  }, [active, item.status, seconds]);
  async function pause() {
    if (pausing || closing.current) return;
    setPausing(true);
    setError(null);
    try {
      capture.current?.interrupt();
      if (itemRef.current.status === 'IN_PROGRESS') {
        capture.current?.flushSpeech();
        live.current?.channel?.dispose();
        live.current = null;
        if (capture.current) capture.current.listening = false;
        await submission.current;
        if (itemRef.current.status === 'IN_PROGRESS') await api.action(id, 'pause');
      } else {
        spoken.current = '';
        await api.action(id, 'resume');
      }
      await refresh();
    } finally {
      setPausing(false);
      setRevision((value) => value + 1);
    }
  }
  if (detail.isError) return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;
  const failedTask = turn?.status === 'FAILED' || task.data?.status === 'FAILED';
  return (
    <div className="conversation-room">
      <div className="room-top">
        <div>
          <Link className="back-link" to="/history">
            <ArrowLeft size={14} />
            我的面试
          </Link>
          <h1>
            {item.job_title}
            <span className="room-mode">
              <ModeIcon mode={mode} size={14} />
              {modeLabels[mode]} · 连续对话
            </span>
          </h1>
        </div>
        <div className="room-timer">
          <strong>
            <Clock3 size={18} />
            {formatClock(seconds)}
          </strong>
          <small>面试剩余时间</small>
        </div>
      </div>
      <div className="conversation-layout">
        <section className="panel conversation-stage">
          <div className="conversation-stage-heading">
            <span className="inline">
              <AudioLines size={17} />
              AI 面试官
            </span>
            {active && (
              <span className="continuous-recording">
                <i />
                全程录制 {formatClock(Math.floor((now - recordedFrom) / 1000))}
              </span>
            )}
          </div>
          <div className="live-caption-heading">
            <span>实时字幕</span>
            <button
              type="button"
              className="text-link"
              aria-pressed={captionsVisible}
              onClick={() => setCaptionsVisible((value) => !value)}
            >
              {captionsVisible ? '关闭字幕' : '显示字幕'}
            </button>
          </div>
          {captionsVisible && (
            <div className="live-captions" role="log" aria-label="实时字幕" aria-live="polite">
              <strong>{subtitle?.speaker === 'candidate' ? '我' : '面试官'}</strong>
              <p>
                {subtitle?.text || (phase === 'speaking' ? '正在识别你的回答…' : '开始后自动显示双方字幕')}
              </p>
              {subtitle?.speaker === 'candidate' && !subtitle.final && <small>识别中</small>}
            </div>
          )}
          {captionsVisible &&
            active &&
            (captionFallback || !item.conversation_features?.live_transcription) && (
              <p className="caption-fallback-note">当前回答将在转写完成后补全字幕，整场录音录像持续保留。</p>
            )}
          <div className={`conversation-visual phase-${phase} ${mode === 'VIDEO' ? 'with-scene' : ''}`}>
            {mode === 'VIDEO' ? (
              <InterviewScene canvas={scene} />
            ) : (
              <div className="conversation-orb">
                <AudioLines size={76} strokeWidth={1.3} />
              </div>
            )}
            <h2>{labels[phase]}</h2>
            <p>
              {active
                ? '自然开口即可回答，停顿后自动分析并继续下一轮'
                : mode === 'VIDEO'
                  ? '左侧面试官数字人，右侧是你；完整分屏与双方声音同步录制'
                  : '一次开始，连续对答；从开场到结束保留一整段双方录音'}
            </p>
          </div>
          <div className="conversation-question">
            <span>
              <Volume2 size={15} />
              {turn?.turn_type === 'FOLLOW_UP' ? '面试官追问' : '面试官提问'}
            </span>
            <p>{turn?.question || '正在准备你的专属面试问题…'}</p>
            {active && item.status === 'IN_PROGRESS' && turn?.status === 'WAITING_ANSWER' && (
              <button
                className="text-link"
                disabled={phase === 'speaking' || sending.current || !!pending.current || pausing}
                onClick={() => {
                  if (turn) void speak(turn, true);
                }}
              >
                <RotateCcw size={13} />
                重听问题
              </button>
            )}
          </div>
          {!active &&
            phase !== 'saving' &&
            !pending.current &&
            !memoryAtRisk() &&
            ['READY', 'IN_PROGRESS', 'PAUSED'].includes(item.status) && (
              <div className="continuous-setup">
                <label className="agreement">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    我同意全程录制麦克风{mode === 'VIDEO' ? '和完整分屏摄像头画面' : ''}
                    ，用于本次面试训练和回放。
                  </span>
                </label>
                <button
                  className="btn primary"
                  disabled={!agreed || phase === 'preparing'}
                  onClick={() => void start()}
                >
                  {phase === 'preparing' ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}
                  {phase === 'preparing'
                    ? '正在准备…'
                    : item.status === 'READY'
                      ? '开始面试并全程录制'
                      : '重新授权并继续面试'}
                </button>
                <p>
                  {mode === 'VIDEO'
                    ? '浏览器会请求麦克风和摄像头；录像同步保留完整左右分屏。'
                    : '浏览器会请求麦克风权限，面试官和你的声音会录在同一段音频里。'}
                </p>
              </div>
            )}
          {item.status === 'PREPARING' && <Loading label="正在生成问题和面试官语音…" />}
          {item.status === 'FAILED' && (
            <button className="btn primary" onClick={() => void api.action(id, 'retry').then(refresh)}>
              <RotateCcw size={16} />
              重试准备
            </button>
          )}
          {error !== null && <ErrorState error={error} />}
          {pending.current && !sending.current && (
            <button
              className="btn secondary"
              onClick={() => {
                submission.current = sendAnswer(pending.current!);
                void submission.current.catch(() => undefined);
              }}
            >
              <RotateCcw size={15} />
              重试这段回答
            </button>
          )}
          {failedTask && turn?.task_id && (
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  await api.retryTask(turn.task_id!);
                  await task.refetch();
                  await refresh();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <RotateCcw size={15} />
              重试分析回答
            </button>
          )}
          {phase === 'saving' && (
            <div className="state-block">
              <LoaderCircle className="spin" size={23} />
              <p>正在保存整场录制 {progress}% · 请保持页面打开</p>
            </div>
          )}
          {active && (
            <div className="conversation-controls">
              <button
                className="btn secondary"
                disabled={phase === 'saving' || pausing}
                onClick={() => void pause().catch(setError)}
              >
                {item.status === 'PAUSED' ? <Play size={15} /> : <Pause size={15} />}
                {item.status === 'PAUSED' ? '继续对话' : '暂停对话'}
              </button>
              <button
                className="btn danger"
                disabled={phase === 'saving' || pausing}
                onClick={() => void stopSession(true)}
              >
                <Square size={14} />
                结束面试并保存
              </button>
            </div>
          )}
          {archive && phase !== 'saving' && (
            <div className="conversation-controls">
              <button className="btn primary" onClick={() => void stopSession(true)}>
                <Check size={15} />
                继续生成报告
              </button>
              {archive.persisted && (
                <Link className="btn secondary" to={`/interviews/${id}/report`}>
                  查看报告与回放
                </Link>
              )}
            </div>
          )}
        </section>
        <aside className="conversation-aside">
          <section className="panel conversation-guide">
            <h3>
              <Headphones size={19} />
              像真实面试一样交流
            </h3>
            <div>
              <Mic size={18} />
              <span>
                <strong>随时开口</strong>
                <small>提问时开口，会停止播放并听你回答</small>
              </span>
            </div>
            <div>
              <AudioLines size={18} />
              <span>
                <strong>自动接续对话</strong>
                <small>停顿约 0.8 秒后接续，追问语音边生成边播放</small>
              </span>
            </div>
            <div>
              <Monitor size={18} />
              <span>
                <strong>完整保留现场</strong>
                <small>
                  {mode === 'VIDEO' ? '一整段双方录音 + 完整分屏录像' : '从开场到结束的一整段双方录音'}
                </small>
              </span>
            </div>
            <p>暂停的是对话，整场录制继续进行。请佩戴耳机，减少面试官声音被麦克风重复采集。</p>
          </section>
          <section className="panel conversation-transcript">
            <h3>
              对话记录 <span>{turns.data?.items.filter((t) => t.status === 'COMPLETED').length || 0} 轮</span>
            </h3>
            {turns.data?.items
              .filter((t) => t.status === 'COMPLETED')
              .map((t) => (
                <div key={t.id}>
                  <strong>面试官</strong>
                  <p>{t.question}</p>
                  <strong>你的回答</strong>
                  <p>{t.transcript || '转写中…'}</p>
                </div>
              ))}
          </section>
        </aside>
      </div>
      {!active && phase !== 'saving' && (
        <SessionReplay
          key={`${id}-${revision}-${archive?.session.id || ''}`}
          interviewId={id}
          capture={archive}
        />
      )}
      <p className="room-footer-note">
        <ShieldCheck size={13} />
        录制持续保存在本机，结束后保存到后端。刷新页面会中断录制，续录会生成新记录。
      </p>
    </div>
  );
}
