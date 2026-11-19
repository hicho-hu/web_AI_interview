import { useEffect, useRef, useState } from 'react';
import { practiceApi } from '../../services/practice';
import { signedUrl } from '../media/upload';

export function useQuestionAudio(sessionId: string, suspended: boolean) {
  const audio = useRef<{ round: number; element: HTMLAudioElement } | null>(
    null,
  );
  const pending = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [error, setError] = useState<{ round: number; message: string } | null>(
    null,
  );
  useEffect(() => {
    setLoading(null);
    setPlaying(null);
    setError(null);
    return () => {
      pending.current?.abort();
      pending.current = null;
      if (audio.current) {
        audio.current.element.onplay =
          audio.current.element.onpause =
          audio.current.element.onended =
          audio.current.element.onerror =
            null;
        audio.current.element.pause();
        audio.current.element.removeAttribute('src');
        audio.current.element.load();
        audio.current = null;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (suspended) {
      pending.current?.abort();
      pending.current = null;
      setLoading(null);
      audio.current?.element.pause();
    }
  }, [suspended]);
  async function toggle(round: number) {
    if (suspended || pending.current) return;
    setError(null);
    if (audio.current?.round === round && !audio.current.element.paused) {
      audio.current.element.pause();
      return;
    }
    if (audio.current?.round !== round && audio.current) {
      audio.current.element.onplay =
        audio.current.element.onpause =
        audio.current.element.onended =
        audio.current.element.onerror =
          null;
      audio.current.element.pause();
      audio.current.element.removeAttribute('src');
      audio.current.element.load();
      audio.current = null;
      setPlaying(null);
    }
    const controller = new AbortController();
    pending.current = controller;
    try {
      if (!audio.current) {
        setLoading(round);
        const media = await practiceApi.questionAudio(
          sessionId,
          round,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!media.download_url)
          throw new Error('题目语音暂不可用，请稍后重试');
        const element = new Audio(signedUrl(media.download_url));
        element.onplay = () => setPlaying(round);
        element.onpause = element.onended = () => setPlaying(null);
        element.onerror = () => {
          if (audio.current?.element !== element) return;
          audio.current = null;
          setPlaying(null);
          setError({
            round,
            message: '问题语音播放失败，请点击播放图标重试。',
          });
        };
        audio.current = { round, element };
      }
      const element = audio.current.element;
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setPlaying(null);
        setError({
          round,
          message:
            failure instanceof DOMException &&
            failure.name === 'NotAllowedError'
              ? '浏览器尚未允许播放，请再次点击播放图标。'
              : failure instanceof Error
                ? failure.message
                : '问题语音暂不可用，请点击重试。',
        });
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(null);
      }
    }
  }
  return { toggle, loading, playing, error };
}
