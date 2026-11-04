import { drawInterviewScene } from './InterviewScene';
import { recordingStore, type SessionRecording } from './recordingStore';
import { VoiceActivity, type Utterance } from './voiceActivity';
import { signedUrl } from './upload';
import { fixWebmDuration } from '@fix-webm-duration/fix';
import { captionsVtt, type CaptionCue } from './captions';

export interface CaptureResult {
  session: SessionRecording;
  audio: Blob;
  video?: Blob;
  captions?: Blob;
  persisted: boolean;
}
interface Callbacks {
  onSpeechStart: () => void;
  onUtterance: (utterance: Utterance) => void;
  onQuestionEnded: () => void;
  onError: (error: Error) => void;
  onCaptureEnded: () => void;
  onMicrophoneFrame?: (frame: Float32Array, sampleRate: number) => void;
  onQuestionStarted?: (durationMs: number) => void;
  onCaption?: (cue: CaptionCue) => void;
  onSpeechDiscarded?: () => void;
}
export class ConversationCapture {
  private context: AudioContext | null = null;
  private mixed: MediaStreamAudioDestinationNode | null = null;
  private mic: MediaStream | null = null;
  private sceneCanvas: HTMLCanvasElement | null = null;
  private questionAnalyser: AnalyserNode | null = null;
  private meterSamples = new Float32Array(256);
  private renderVideos: HTMLVideoElement[] = [];
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private recorders: { kind: 'audio' | 'video'; recorder: MediaRecorder; chunks: Blob[] }[] = [];
  private worklet: AudioWorkletNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private questionRequest: AbortController | null = null;
  private questionGeneration = 0;
  private vad: VoiceActivity | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private storageFailed = false;
  private closed = false;
  private started = 0;
  private stopPromise: Promise<CaptureResult> | null = null;
  private streamSources = new Set<AudioBufferSourceNode>();
  private streamEnd = 0;
  private streamFinished = false;
  private subtitle: CaptionCue | null = null;
  private captionBackupAt = 0;
  showCaptions = true;
  session: SessionRecording;
  constructor(
    userId: string,
    interviewId: string,
    mode: 'VOICE' | 'VIDEO',
    private callbacks: Callbacks,
  ) {
    this.session = {
      id: crypto.randomUUID(),
      userId,
      interviewId,
      mode,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      status: 'recording',
      audioType: '',
      captions: [],
    };
  }
  get scene() {
    return this.sceneCanvas;
  }
  get preview() {
    return this.mic;
  }
  get active() {
    return this.started > 0 && !this.closed;
  }
  get speaking() {
    return this.vad?.active === true;
  }
  set listening(value: boolean) {
    if (this.vad) {
      this.vad.enabled = value;
      if (!value) this.vad.reset();
    }
  }
  flushSpeech() {
    this.vad?.flush();
  }
  waitForSilence() {
    return this.vad?.waitForSilence() || Promise.resolve();
  }
  get elapsedMs() {
    return this.started ? Date.now() - this.started : 0;
  }
  caption(cue: CaptionCue) {
    const cues = (this.session.captions ||= []);
    const index = cues.findIndex((value) => value.id === cue.id);
    if (index >= 0) cues[index] = cue;
    else cues.push(cue);
    if (
      !this.subtitle ||
      cue.startMs >= this.subtitle.startMs ||
      cue.id === this.subtitle.id ||
      (cue.speaker === 'candidate' && !cue.final && cue.endMs >= this.subtitle.startMs)
    ) {
      this.subtitle = cue;
      this.callbacks.onCaption?.(cue);
    }
    if (this.active && Date.now() - this.captionBackupAt >= 1000) {
      this.captionBackupAt = Date.now();
      const snapshot = { ...this.session, captions: cues.map((value) => ({ ...value })) };
      this.pendingWrite = this.pendingWrite
        .then(() => recordingStore.save(snapshot))
        .catch(() => {
          this.storageFailed = true;
        });
    }
  }
  finalizeCandidate(turnId: string, text: string) {
    const matching = this.session.captions?.filter((cue) => cue.id.startsWith(`candidate:${turnId}:`)) || [];
    if (!matching.length || (matching.length === 1 && matching[0].final && matching[0].text === text)) return;
    this.session.captions = this.session.captions?.filter(
      (cue) => !cue.id.startsWith(`candidate:${turnId}:`),
    );
    this.caption({
      id: `candidate:${turnId}:final`,
      speaker: 'candidate',
      text,
      final: true,
      startMs: Math.min(...matching.map((cue) => cue.startMs)),
      endMs: Math.max(...matching.map((cue) => cue.endMs)),
    });
  }
  beginAudioStream() {
    this.interrupt();
    this.streamEnd = 0;
    this.streamFinished = false;
  }
  appendAudio(pcm: string, sampleRate: number) {
    if (!this.context || this.closed || this.vad?.active) return;
    const binary = atob(pcm),
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (!bytes.length || bytes.length % 2 || sampleRate !== 24000) throw new Error('流式语音格式无效');
    const buffer = this.context.createBuffer(1, bytes.length / 2, sampleRate),
      samples = buffer.getChannelData(0),
      view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.connect(this.mixed!);
    if (this.questionAnalyser) source.connect(this.questionAnalyser);
    const first = this.streamEnd === 0;
    const when = Math.max(this.context.currentTime + (first ? 0.08 : 0.005), this.streamEnd);
    this.streamEnd = when + buffer.duration;
    this.streamSources.add(source);
    const generation = this.questionGeneration;
    source.onended = () => {
      this.streamSources.delete(source);
      source.disconnect();
      if (this.streamFinished && !this.streamSources.size && generation === this.questionGeneration)
        this.callbacks.onQuestionEnded();
    };
    source.start(when);
    if (first) this.callbacks.onQuestionStarted?.(buffer.duration * 1000);
    else if (this.subtitle?.speaker === 'interviewer')
      this.caption({
        ...this.subtitle,
        endMs: this.elapsedMs + (this.streamEnd - this.context.currentTime) * 1000,
      });
  }
  finishAudioStream() {
    this.streamFinished = true;
    if (!this.streamSources.size) this.callbacks.onQuestionEnded();
  }

  async prepare() {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder ||
      !window.AudioContext
    )
      throw new Error('连续面试需要 HTTPS 或 localhost，以及支持录制的现代浏览器。');
    try {
      this.context = new AudioContext();
      const resumeRequest = this.context.resume();
      void resumeRequest.catch(() => undefined);
      if (this.closed) throw new Error('录制准备已取消');
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video:
          this.session.mode === 'VIDEO'
            ? { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 } }
            : false,
      });
      await resumeRequest;
      if (this.closed) throw new Error('录制准备已取消');
      const context = this.context;
      this.mixed = context.createMediaStreamDestination();
      const micSource = context.createMediaStreamSource(new MediaStream(this.mic.getAudioTracks()));
      micSource.connect(this.mixed);
      await context.audioWorklet.addModule('/pcm-capture.js');
      this.vad = new VoiceActivity(
        context.sampleRate,
        () => {
          this.interrupt();
          this.callbacks.onSpeechStart();
        },
        (value) => this.callbacks.onUtterance(value),
        {
          silenceMs: 800,
          onAudio: (frame) => this.callbacks.onMicrophoneFrame?.(frame, context.sampleRate),
          onDiscard: () => this.callbacks.onSpeechDiscarded?.(),
        },
      );
      this.worklet = new AudioWorkletNode(context, 'interview-pcm-capture');
      this.worklet.port.onmessage = (event) => this.vad?.push(new Float32Array(event.data));
      const silent = context.createGain();
      silent.gain.value = 0;
      this.questionAnalyser = context.createAnalyser();
      this.questionAnalyser.fftSize = 256;
      this.questionAnalyser.connect(silent);
      micSource.connect(this.worklet);
      this.worklet.connect(silent);
      silent.connect(context.destination);
      const audioMime = ['audio/webm;codecs=opus', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!audioMime) throw new Error('浏览器不支持连续音频录制，请使用新版 Chrome 或 Edge。');
      this.addRecorder('audio', new MediaStream(this.mixed.stream.getAudioTracks()), audioMime);
      this.session.audioType = audioMime.split(';')[0];
      if (this.session.mode === 'VIDEO') {
        if (!this.mic.getVideoTracks().length) throw new Error('未获得摄像头画面，请允许摄像头后重新开始');
        const camera = await this.videoElement(this.mic);
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        this.sceneCanvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建分屏画布');
        const draw = () => {
          let power = 0;
          this.questionAnalyser?.getFloatTimeDomainData(this.meterSamples);
          for (const value of this.meterSamples) power += value * value;
          const level = Math.min(1, Math.sqrt(power / this.meterSamples.length) * 7);
          const show =
            this.showCaptions && this.subtitle?.text && this.elapsedMs <= this.subtitle.endMs + 2000;
          drawInterviewScene(ctx, {
            camera,
            time: Date.now(),
            elapsedMs: this.elapsedMs,
            level,
            candidateSpeaking: this.speaking,
            caption: show
              ? (this.subtitle!.speaker === 'interviewer' ? '面试官：' : '我：') + this.subtitle!.text
              : undefined,
          });
        };
        draw();
        this.frameTimer = setInterval(draw, 1000 / 24);
        const canvasStream = canvas.captureStream(24);
        const videoMime = ['video/webm;codecs=vp8,opus', 'video/mp4'].find((type) =>
          MediaRecorder.isTypeSupported(type),
        );
        if (!videoMime) throw new Error('浏览器不支持连续录像，请使用新版 Chrome 或 Edge。');
        this.addRecorder(
          'video',
          new MediaStream([...canvasStream.getVideoTracks(), ...this.mixed.stream.getAudioTracks()]),
          videoMime,
        );
        this.session.videoType = videoMime.split(';')[0];
      }
      for (const track of this.mic.getTracks())
        track.onended = () => {
          if (!this.closed) this.callbacks.onCaptureEnded();
        };
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private async videoElement(stream: MediaStream) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.renderVideos.push(video);
    await video.play();
    return video;
  }
  private addRecorder(kind: 'audio' | 'video', stream: MediaStream, mimeType: string) {
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 64000,
      ...(kind === 'video' ? { videoBitsPerSecond: 600000 } : {}),
    });
    const entry = { kind, recorder, chunks: [] as Blob[] };
    let index = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      entry.chunks.push(event.data);
      const chunkIndex = index++;
      this.pendingWrite = this.pendingWrite
        .then(() => recordingStore.append(this.session.id, kind, chunkIndex, event.data))
        .catch(() => {
          if (!this.storageFailed)
            this.callbacks.onError(new Error('浏览器本地备份不可用。录制仍在进行，结束后请保存或下载文件。'));
          this.storageFailed = true;
        });
    };
    recorder.onerror = () => this.callbacks.onCaptureEnded();
    this.recorders.push(entry);
  }
  async start() {
    if (!this.mixed || this.closed) throw new Error('设备尚未准备好');
    try {
      await recordingStore.save(this.session);
    } catch {
      this.storageFailed = true;
    }
    this.started = Date.now();
    this.session.startedAt = new Date(this.started).toISOString();
    for (const entry of this.recorders) entry.recorder.start(1000);
  }
  async playQuestion(url: string) {
    if (this.vad?.active || this.closed) return;
    this.interrupt();
    const generation = this.questionGeneration;
    this.questionRequest = new AbortController();
    const response = await fetch(signedUrl(url), { signal: this.questionRequest.signal });
    if (!response.ok) throw new Error('面试官语音加载失败，请重试');
    const bytes = await response.arrayBuffer();
    if (!this.context || this.closed || generation !== this.questionGeneration) return;
    const audio = await this.context.decodeAudioData(bytes);
    if (generation !== this.questionGeneration || this.closed) return;
    const source = this.context.createBufferSource();
    source.buffer = audio;
    source.connect(this.context.destination);
    source.connect(this.mixed!);
    if (this.questionAnalyser) source.connect(this.questionAnalyser);
    this.source = source;
    source.onended = () => {
      if (generation === this.questionGeneration && this.source === source) {
        this.source = null;
        this.callbacks.onQuestionEnded();
      }
    };
    source.start();
    this.callbacks.onQuestionStarted?.(audio.duration * 1000);
  }
  interrupt() {
    if (this.subtitle?.speaker === 'interviewer' && this.subtitle.endMs > this.elapsedMs)
      this.caption({ ...this.subtitle, endMs: this.elapsedMs });
    this.questionGeneration++;
    this.questionRequest?.abort();
    this.questionRequest = null;
    for (const source of this.streamSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* A scheduled buffer may already have ended. */
      }
      source.disconnect();
    }
    this.streamSources.clear();
    this.streamEnd = 0;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* Already ended. */
      }
      this.source.disconnect();
      this.source = null;
    }
  }
  stop(interrupted = false): Promise<CaptureResult> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.finish(interrupted);
    return this.stopPromise;
  }
  private async finish(interrupted: boolean): Promise<CaptureResult> {
    const stoppedAt = Date.now();
    this.closed = true;
    this.interrupt();
    this.listening = false;
    await Promise.all(
      this.recorders.map(
        ({ recorder }) =>
          new Promise<void>((resolve) => {
            if (recorder.state === 'inactive') return resolve();
            recorder.addEventListener('stop', () => resolve(), { once: true });
            recorder.stop();
          }),
      ),
    );
    await this.pendingWrite;
    this.session = {
      ...this.session,
      durationMs: Math.max(1, stoppedAt - this.started),
      status: interrupted ? 'interrupted' : 'saved',
    };
    try {
      await recordingStore.save(this.session);
    } catch {
      this.storageFailed = true;
    }
    let audio = new Blob(this.recorders.find((e) => e.kind === 'audio')?.chunks || [], {
      type: this.session.audioType,
    });
    const videoEntry = this.recorders.find((e) => e.kind === 'video');
    let video = videoEntry ? new Blob(videoEntry.chunks, { type: this.session.videoType }) : undefined;
    this.dispose();
    // Preserve the playable original if optional duration metadata repair fails.
    if (audio.type.includes('webm'))
      audio = await fixWebmDuration(audio, this.session.durationMs, { logger: false }).catch(() => audio);
    if (video?.type.includes('webm'))
      video = await fixWebmDuration(video, this.session.durationMs, { logger: false }).catch(() => video!);
    const captions = this.session.captions?.length ? captionsVtt(this.session.captions) : undefined;
    return { session: this.session, audio, video, captions, persisted: !this.storageFailed };
  }
  dispose() {
    this.closed = true;
    this.interrupt();
    this.vad?.reset();
    if (this.frameTimer) clearInterval(this.frameTimer);
    for (const entry of this.recorders) {
      if (entry.recorder.state !== 'inactive') entry.recorder.stop();
      entry.recorder.stream.getVideoTracks().forEach((t) => t.stop());
    }
    this.worklet?.disconnect();
    this.worklet?.port.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.questionAnalyser?.disconnect();
    this.renderVideos.forEach((video) => {
      video.pause();
      video.srcObject = null;
    });
    if (this.context?.state !== 'closed') void this.context?.close();
  }
}
