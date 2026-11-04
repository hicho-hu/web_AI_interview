import { useSession } from '../../stores/session';
import { ApiError } from '../../services/client';

export interface LiveTranscript {
  transcriptId: string;
  text: string;
}
export interface AnswerEvent {
  type:
    | 'accepted'
    | 'transcribing'
    | 'thinking'
    | 'transcript'
    | 'question'
    | 'audio_reset'
    | 'audio'
    | 'audio_end'
    | 'complete'
    | 'deferred';
  turn_id?: string;
  text?: string;
  pcm?: string;
  sample_rate?: number;
  turn_no?: number;
  main_index?: number;
  turn_type?: string;
  competency?: string;
  interview?: import('../../types/domain').Interview;
}
function endpoint(path: string) {
  return new URL(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}${path}`, window.location.origin);
}
export async function streamAnswer(
  interviewId: string,
  turnId: string,
  body: object,
  key: string,
  onEvent: (event: AnswerEvent) => void,
) {
  const response = await fetch(endpoint(`/interviews/${interviewId}/turns/${turnId}/submit-stream`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${useSession.getState().token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ApiError(
      result?.message || '实时对话连接失败，请重试',
      result?.code || 'NETWORK_ERROR',
      result?.request_id,
      response.status,
    );
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body)
    throw new Error('实时对话返回格式无效');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.length > 2 * 1024 * 1024) throw new Error('实时对话数据超过限制');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = message
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          const event = JSON.parse(data) as AnswerEvent;
          if (event.type === 'complete' || event.type === 'deferred') complete = true;
          onEvent(event);
        }
      }
      if (done) break;
    }
    if (!complete) throw new Error('实时对话连接中断，正在恢复面试进度');
  } finally {
    reader.releaseLock();
  }
}

export class LiveTranscription {
  private ws: WebSocket;
  private queued: Uint8Array[] = [];
  private ready = false;
  private ended = false;
  private resolved = false;
  private resolve!: (result: LiveTranscript | null) => void;
  private result: Promise<LiveTranscript | null>;
  private timer: ReturnType<typeof setTimeout>;
  constructor(
    interviewId: string,
    turnId: string,
    private onCaption: (text: string, final: boolean) => void,
    private onUnavailable: () => void,
  ) {
    const url = endpoint(`/interviews/${interviewId}/live-transcription`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(url);
    this.result = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.timer = setTimeout(() => this.fail(), 10000);
    this.ws.onopen = () =>
      this.ws.send(JSON.stringify({ token: useSession.getState().token, turn_id: turnId }));
    this.ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === 'ready') {
          clearTimeout(this.timer);
          this.ready = true;
          this.queued.forEach((data) => this.ws.send(data));
          this.queued = [];
          if (this.ended) this.sendFinish();
        } else if (event.type === 'caption' && typeof event.text === 'string')
          this.onCaption(event.text, event.final === true);
        else if (
          event.type === 'complete' &&
          typeof event.transcript_id === 'string' &&
          typeof event.text === 'string'
        ) {
          this.onCaption(event.text, true);
          this.settle({ transcriptId: event.transcript_id, text: event.text });
        } else if (event.type === 'error') this.fail();
      } catch {
        this.fail();
      }
    };
    this.ws.onerror = () => this.fail();
    this.ws.onclose = () => {
      if (!this.resolved) this.fail();
    };
  }
  push(bytes: Uint8Array) {
    if (this.ended || this.resolved || !bytes.length) return;
    if (this.ready && this.ws.readyState === WebSocket.OPEN) this.ws.send(bytes);
    else {
      this.queued.push(bytes);
      if (this.queued.reduce((n, value) => n + value.length, 0) > 32000 * 10) this.fail();
    }
    if (this.ws.bufferedAmount > 32000 * 5) this.fail();
  }
  finish() {
    if (!this.ended && !this.resolved) {
      this.ended = true;
      if (this.ready) this.sendFinish();
    }
    return this.result;
  }
  private sendFinish() {
    this.ws.send(JSON.stringify({ type: 'finish' }));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(), 2500);
  }
  private settle(result: LiveTranscript | null) {
    if (this.resolved) return;
    this.resolved = true;
    clearTimeout(this.timer);
    this.queued = [];
    this.resolve(result);
    this.ws.close();
  }
  private fail() {
    if (!this.resolved) {
      this.onUnavailable();
      this.settle(null);
    }
  }
  dispose() {
    this.settle(null);
  }
}
