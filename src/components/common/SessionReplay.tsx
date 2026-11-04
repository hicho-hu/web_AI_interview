import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Headphones, LoaderCircle, MonitorPlay, Upload } from 'lucide-react';
import { api } from '../../services/api';
import { useSession } from '../../stores/session';
import { recordingStore, type SessionRecording } from '../../features/media/recordingStore';
import { loadCapture, uploadSession } from '../../features/media/sessionUpload';
import { signedUrl } from '../../features/media/upload';
import { ErrorState } from './ui';
import { formatClock } from '../../utils/interview';
import type { CaptureResult } from '../../features/media/ConversationCapture';
import { captionsVtt, parseCaptionsVtt, type CaptionCue } from '../../features/media/captions';

export default function SessionReplay({
  interviewId,
  capture,
}: {
  interviewId: string;
  capture?: CaptureResult | null;
}) {
  const userId = useSession((s) => s.user?.id || '');
  const [local, setLocal] = useState<SessionRecording[]>([]);
  const [audio, setAudio] = useState('');
  const [video, setVideo] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [captionUrl, setCaptionUrl] = useState('');
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const remote = useQuery({
    queryKey: ['session-media', interviewId],
    queryFn: () => api.sessionMedia(interviewId),
    retry: false,
  });
  useEffect(() => {
    let active = true;
    void recordingStore
      .list(userId, interviewId)
      .then((value) => {
        if (active) setLocal(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId, interviewId]);
  const session = capture?.session || local[0];
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setAudio('');
    setVideo('');
    if (session)
      void (capture ? Promise.resolve(capture) : loadCapture(session))
        .then((result) => {
          if (!active) return;
          if (result.audio.size) {
            const url = URL.createObjectURL(result.audio);
            urls.push(url);
            setAudio(url);
          }
          if (result.video?.size) {
            const url = URL.createObjectURL(result.video);
            urls.push(url);
            setVideo(url);
          }
        })
        .catch(setError);
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [session?.id, capture]);
  // Local recordings carry the exact pair of cloud asset IDs. Never combine the
  // latest local video with an older cloud audio after a partial upload or resume.
  const cloudAudio = remote.data
    ?.filter(
      (m) =>
        m.media_type === 'SESSION_AUDIO' &&
        m.status === 'READY' &&
        (!session || m.id === session.uploadedAudioId),
    )
    .at(-1);
  const cloudVideo = remote.data
    ?.filter(
      (m) =>
        m.media_type === 'SESSION_VIDEO' &&
        m.status === 'READY' &&
        (!session || m.id === session.uploadedVideoId),
    )
    .at(-1);
  const audioSource = audio || (cloudAudio?.download_url ? signedUrl(cloudAudio.download_url) : '');
  const videoSource = video || (cloudVideo?.download_url ? signedUrl(cloudVideo.download_url) : '');
  const savedRemotely = session
    ? !!session.uploadedAudioId &&
      (!session.videoType || !!session.uploadedVideoId) &&
      (!session.captions?.length || !!session.uploadedCaptionsId)
    : !!cloudAudio && (!cloudVideo || !!cloudVideo.download_url);
  const cloudCaptions = remote.data
    ?.filter(
      (m) =>
        m.media_type === 'SESSION_CAPTIONS' &&
        m.status === 'READY' &&
        (!session || m.id === session.uploadedCaptionsId),
    )
    .at(-1);
  useEffect(() => {
    let active = true,
      url = '';
    const abort = new AbortController();
    setCaptionUrl('');
    setCues([]);
    async function prepareCaptions() {
      let current = session?.captions || [];
      if (!current.length && cloudCaptions?.download_url) {
        const response = await fetch(signedUrl(cloudCaptions.download_url), { signal: abort.signal });
        if (!response.ok) throw new Error('字幕加载失败，可刷新后重试');
        current = parseCaptionsVtt(await response.text());
      }
      if (!active || !current.length) return;
      url = URL.createObjectURL(captionsVtt(current));
      setCaptionUrl(url);
      setCues(current);
    }
    void prepareCaptions().catch((e) => {
      if (active) setError(e);
    });
    return () => {
      active = false;
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [session?.id, cloudCaptions?.download_url]);
  const currentCues = cues.filter((cue) => cue.startMs <= playhead && cue.endMs >= playhead);
  if (!session && !cloudAudio && !cloudVideo) return null;
  async function retryUpload() {
    if (!session) return;
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadSession(capture || (await loadCapture(session)), setProgress);
      setLocal((value) => value.map((s) => (s.id === updated.id ? { ...updated } : s)));
      await remote.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="panel session-replay no-print">
      <div className="panel-heading">
        <div>
          <h2>
            <MonitorPlay size={19} />
            整场面试回放
          </h2>
          <p>包含面试官提问与你的回答，从开始到结束连续记录</p>
        </div>
        <span className="tag">
          {savedRemotely
            ? '已保存到后端'
            : capture && !capture.persisted
              ? '待保存 · 请先下载'
              : '当前浏览器备份'}
        </span>
      </div>
      {session?.status === 'recording' && (
        <div className="info-banner">上次页面意外关闭，以下为已备份的录制；最后未写入的部分可能缺失。</div>
      )}
      {session?.status === 'interrupted' && (
        <div className="info-banner">录制曾中断，此回放保留了中断前的完整片段。续录会作为独立记录保存。</div>
      )}
      {videoSource && (
        <video
          controls
          preload="metadata"
          playsInline
          src={videoSource}
          aria-label="整场面试视频回放"
          onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime * 1000)}
        >
          {captionUrl && <track kind="subtitles" src={captionUrl} srcLang="zh" label="双方字幕" />}
        </video>
      )}
      {audioSource && (
        <div className="full-audio-player">
          <Headphones size={20} />
          <span>整场面试录音</span>
          <audio
            controls
            preload="metadata"
            src={audioSource}
            aria-label="整场面试语音回放"
            onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime * 1000)}
          />
        </div>
      )}
      {!!currentCues.length && (
        <div className="live-captions" aria-label="回放字幕">
          {currentCues.map((cue) => (
            <p key={cue.id}>
              {cue.speaker === 'interviewer' ? '面试官' : '我'}：{cue.text}
            </p>
          ))}
        </div>
      )}
      <div className="session-replay-actions">
        <span>
          {session
            ? formatClock(Math.round(session.durationMs / 1000))
            : cloudAudio?.duration_ms
              ? formatClock(Math.round(cloudAudio.duration_ms / 1000))
              : ''}
          {local.length > 1 ? ` · 含 ${local.length} 次录制，正在播放最近一次` : ''}
        </span>
        {audioSource && (
          <a
            className="btn secondary small"
            download={`interview-${interviewId}-audio.${session?.audioType.includes('mp4') ? 'm4a' : 'webm'}`}
            href={audio || audioSource}
          >
            <Download size={14} />
            下载录音
          </a>
        )}
        {videoSource && (
          <a
            className="btn secondary small"
            download={`interview-${interviewId}-video.${session?.videoType?.includes('mp4') ? 'mp4' : 'webm'}`}
            href={video || videoSource}
          >
            <Download size={14} />
            下载录像
          </a>
        )}
        {captionUrl && (
          <a
            className="btn secondary small"
            download={`interview-${interviewId}-captions.vtt`}
            href={captionUrl}
          >
            <Download size={14} />
            下载字幕
          </a>
        )}
        {session &&
          (!session.uploadedAudioId ||
            (session.videoType && !session.uploadedVideoId) ||
            (session.captions?.length && !session.uploadedCaptionsId)) && (
            <button className="btn primary small" disabled={uploading} onClick={() => void retryUpload()}>
              {uploading ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
              {uploading ? `保存中 ${progress}%` : '保存到后端'}
            </button>
          )}
      </div>
      {error !== null && <ErrorState error={error} />}
    </section>
  );
}
