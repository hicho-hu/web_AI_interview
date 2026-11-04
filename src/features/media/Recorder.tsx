import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { Circle, LoaderCircle, Mic, RotateCcw, ShieldCheck, Square, Upload, Video } from 'lucide-react';
import type { Mode } from '../../types/domain';
import { api } from '../../services/api';
import { uploadFile } from './upload';
import { ErrorState } from '../../components/common/ui';
import { formatClock } from '../../utils/interview';

export default function Recorder({
  mode,
  interviewId,
  turnId,
  disabled,
  onUploaded,
  onDirty,
}: {
  mode: Mode;
  interviewId: string;
  turnId: string;
  disabled: boolean;
  onUploaded: (assetId: string, duration: number) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'ready' | 'uploading'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [consent, setConsent] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const started = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploaded = useRef<string | null>(null);
  const { message } = App.useApp();
  const limit = mode === 'VIDEO' ? 120 : 180;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    onDirty(state === 'recording' || !!blob);
  }, [state, blob, onDirty]);
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  useEffect(() => {
    if (disabled && recorder.current?.state === 'recording') recorder.current.stop();
  }, [disabled]);
  async function start() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(new Error('此浏览器无法录制。请使用 HTTPS 或 localhost，并升级浏览器；也可文字作答。'));
      return;
    }
    if (!consent) {
      setError(new Error('请先勾选本次录音录像授权'));
      return;
    }
    try {
      await api.ensureConsents(mode === 'VIDEO' ? ['MICROPHONE', 'CAMERA'] : ['MICROPHONE']);
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video:
          mode === 'VIDEO'
            ? {
                width: { ideal: 1280, max: 1280 },
                height: { ideal: 720, max: 720 },
                frameRate: { ideal: 24, max: 30 },
              }
            : false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const formats =
        mode === 'VIDEO'
          ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
          : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mime = formats.find((f) => MediaRecorder.isTypeSupported(f));
      if (!mime) {
        media.getTracks().forEach((t) => t.stop());
        throw new Error('浏览器没有与后端兼容的录制格式，请使用文字作答');
      }
      const rec = new MediaRecorder(media, {
        mimeType: mime,
        ...(mode === 'VIDEO'
          ? { videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 }
          : { audioBitsPerSecond: 96000 }),
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        const type = rec.mimeType.split(';')[0];
        const result = new Blob(chunks, { type });
        setDuration(Math.max(1, Math.min(limit * 1000, Date.now() - started.current)));
        setBlob(result);
        setState('ready');
        if (video.current) video.current.srcObject = null;
      };
      rec.onerror = () => {
        setError(new Error('录制中断，请重新录制或使用文字作答'));
        if (rec.state !== 'inactive') rec.stop();
      };
      media.getTracks().forEach((track) => {
        track.onended = () => {
          if (rec.state === 'recording') rec.stop();
        };
      });
      recorder.current = rec;
      setBlob(null);
      uploaded.current = null;
      setSeconds(0);
      started.current = Date.now();
      rec.start();
      setState('recording');
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => undefined);
        }
      });
      timer.current = setInterval(() => {
        const sec = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(sec);
        if (sec >= limit && rec.state === 'recording') rec.stop();
      }, 250);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e instanceof DOMException
          ? new Error(
              e.name === 'NotAllowedError'
                ? '未获得设备权限。可在浏览器地址栏授权，或使用文字回答。'
                : '设备不可用，请检查麦克风或摄像头是否被占用。',
            )
          : e,
      );
    }
  }
  async function upload() {
    if (!blob) return;
    setState('uploading');
    setError(null);
    try {
      if (!uploaded.current) {
        const ticket = await uploadFile(
          blob,
          {
            filename: `answer-${turnId}.${blob.type.includes('mp4') ? (mode === 'VIDEO' ? 'mp4' : 'm4a') : 'webm'}`,
            content_type: blob.type,
            size: blob.size,
            media_type: mode === 'VIDEO' ? 'VIDEO' : 'AUDIO',
            interview_id: interviewId,
            turn_id: turnId,
            duration_ms: duration,
          },
          setProgress,
        );
        uploaded.current = ticket.asset_id;
      }
      await onUploaded(uploaded.current, duration);
      setBlob(null);
      setState('idle');
      onDirty(false);
      void message.success('回答已提交，正在处理');
    } catch (e) {
      setError(e);
      setState('ready');
    }
  }
  return (
    <div className="recorder">
      <div className={`record-preview ${state === 'recording' ? 'recording' : ''}`}>
        {mode === 'VIDEO' && state === 'recording' ? (
          <video ref={video} muted autoPlay playsInline aria-label="摄像头预览" />
        ) : blob && url ? (
          mode === 'VIDEO' ? (
            <video src={url} controls playsInline aria-label="回答录像回放" />
          ) : (
            <div className="audio-playback">
              <Mic size={36} />
              <audio src={url} controls aria-label="回答录音回放" />
              <span>
                {formatClock(Math.round(duration / 1000))} · {Math.round(blob.size / 1024)} KB
              </span>
            </div>
          )
        ) : (
          <div className="record-idle">
            {mode === 'VIDEO' ? <Video size={40} strokeWidth={1.3} /> : <Mic size={40} strokeWidth={1.3} />}
            <strong>{state === 'recording' ? '正在认真记录你的回答' : '准备好了，就开始表达'}</strong>
            <p>
              {state === 'recording'
                ? formatClock(seconds)
                : `每段最长 ${limit / 60} 分钟，停止后可回放或重录`}
            </p>
            {state === 'recording' && (
              <div className="record-wave">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.07}s` }} />
                ))}
              </div>
            )}
          </div>
        )}
        {state === 'recording' && (
          <span className="recording-badge">
            <i />
            REC {formatClock(seconds)}
          </span>
        )}
      </div>
      <label className="agreement media-agreement">
        <input
          type="checkbox"
          checked={consent}
          disabled={state !== 'idle'}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          <ShieldCheck size={13} />
          我授权本次{mode === 'VIDEO' ? '摄像头和麦克风' : '麦克风'}采集，仅用于面试训练。
        </span>
      </label>
      {error !== null && <ErrorState error={error} />}
      <div className="record-actions">
        {state === 'recording' ? (
          <button className="btn danger" onClick={() => recorder.current?.stop()}>
            <Square size={15} fill="currentColor" />
            停止录制
          </button>
        ) : state === 'ready' ? (
          <>
            <button
              className="btn secondary"
              disabled={disabled}
              onClick={() => {
                setBlob(null);
                uploaded.current = null;
                setState('idle');
              }}
            >
              <RotateCcw size={16} />
              重新录制
            </button>
            <button className="btn primary" disabled={disabled} onClick={() => void upload()}>
              <Upload size={16} />
              上传并提交回答
            </button>
          </>
        ) : state === 'uploading' ? (
          <span className="inline muted">
            <LoaderCircle className="spin" size={17} />
            上传并确认中 {progress}%
          </span>
        ) : (
          <button className="btn primary" disabled={disabled || !consent} onClick={() => void start()}>
            <Circle size={15} fill="currentColor" />
            开始录制
          </button>
        )}
      </div>
      <p className="record-local-note">未提交的录制仅保存在当前页面，刷新或离开后会丢失。</p>
    </div>
  );
}
