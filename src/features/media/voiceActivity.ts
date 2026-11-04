export interface Utterance {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}

// Hysteresis and a minimum speech duration reject clicks and quiet background noise.
export class VoiceActivity {
  private preRoll: Float32Array[] = [];
  private frames: Float32Array[] = [];
  private speaking = false;
  private voicedMs = 0;
  private quietMs = 0;
  private durationMs = 0;
  private silenceWaiters = new Set<() => void>();
  enabled = false;
  constructor(
    private sampleRate: number,
    private onStart: () => void,
    private onEnd: (value: Utterance) => void,
    private options: {
      silenceMs?: number;
      onAudio?: (frame: Float32Array) => void;
      onDiscard?: () => void;
    } = {},
  ) {}
  get active() {
    return this.speaking;
  }
  waitForSilence(): Promise<void> {
    if (!this.speaking) return Promise.resolve();
    return new Promise((resolve) => this.silenceWaiters.add(resolve));
  }
  push(frame: Float32Array) {
    if (!this.enabled) {
      this.reset();
      return;
    }
    const ms = (frame.length / this.sampleRate) * 1000;
    const rms = Math.sqrt(frame.reduce((sum, n) => sum + n * n, 0) / frame.length);
    const voiced = rms > (this.speaking ? 0.012 : 0.023);
    if (!this.speaking) {
      this.preRoll.push(frame);
      while (this.preRoll.reduce((n, f) => n + f.length, 0) > this.sampleRate * 0.35) this.preRoll.shift();
      this.voicedMs = voiced ? this.voicedMs + ms : 0;
      if (this.voicedMs < 160) return;
      this.speaking = true;
      this.frames = [...this.preRoll];
      this.durationMs = (this.frames.reduce((n, f) => n + f.length, 0) / this.sampleRate) * 1000;
      this.preRoll = [];
      this.onStart();
      this.frames.forEach((part) => this.options.onAudio?.(part));
      return;
    }
    this.frames.push(frame);
    this.options.onAudio?.(frame);
    this.durationMs += ms;
    if (voiced) {
      this.quietMs = 0;
      this.voicedMs += ms;
    } else this.quietMs += ms;
    if (this.quietMs >= (this.options.silenceMs ?? 1600) || this.durationMs >= 170000) this.flush();
  }
  flush() {
    if (!this.speaking || this.voicedMs < 240) {
      if (this.speaking) this.options.onDiscard?.();
      this.reset();
      return;
    }
    const samples = new Float32Array(this.frames.reduce((n, f) => n + f.length, 0));
    let offset = 0;
    for (const frame of this.frames) {
      samples.set(frame, offset);
      offset += frame.length;
    }
    const value = {
      samples,
      sampleRate: this.sampleRate,
      durationMs: (samples.length / this.sampleRate) * 1000,
    };
    this.reset();
    this.onEnd(value);
  }
  reset() {
    this.frames = [];
    this.preRoll = [];
    this.speaking = false;
    this.voicedMs = this.quietMs = this.durationMs = 0;
    this.silenceWaiters.forEach((resolve) => resolve());
    this.silenceWaiters.clear();
  }
}

export function joinUtterances(parts: Utterance[]): Utterance {
  const sampleRate = parts[0].sampleRate;
  const samples = new Float32Array(parts.reduce((length, part) => length + part.samples.length, 0));
  let offset = 0;
  for (const part of parts) {
    if (part.sampleRate !== sampleRate) throw new Error('回答的采样率发生变化，请重新连接麦克风');
    samples.set(part.samples, offset);
    offset += part.samples.length;
  }
  return { samples, sampleRate, durationMs: (samples.length / sampleRate) * 1000 };
}

export function wavBlob(input: Float32Array, inputRate: number) {
  const rate = 16000,
    pcm = new Pcm16Encoder(inputRate).push(input);
  const count = pcm.length / 2,
    bytes = new ArrayBuffer(44 + count * 2),
    view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  new Uint8Array(bytes, 44).set(pcm);
  return new Blob([bytes], { type: 'audio/wav' });
}

// Integer sample positions keep live PCM and the final WAV byte-for-byte equal,
// including 44.1 kHz input and worklet frames split across resampling boundaries.
export class Pcm16Encoder {
  private carry = new Float32Array();
  private base = 0;
  private output = 0;
  constructor(private inputRate: number) {}
  push(frame: Float32Array) {
    const data = new Float32Array(this.carry.length + frame.length);
    data.set(this.carry);
    data.set(frame, this.carry.length);
    const total = this.base + data.length,
      end = Math.floor((total * 16000) / this.inputRate);
    const bytes = new Uint8Array(Math.max(0, end - this.output) * 2),
      view = new DataView(bytes.buffer);
    let written = 0;
    while (this.output < end) {
      const from = Math.floor((this.output * this.inputRate) / 16000);
      const to = Math.max(from + 1, Math.floor(((this.output + 1) * this.inputRate) / 16000));
      if (to > total) break;
      let value = 0;
      for (let i = from; i < to; i++) value += data[i - this.base];
      value = Math.max(-1, Math.min(1, value / (to - from)));
      view.setInt16(written, value < 0 ? value * 32768 : value * 32767, true);
      written += 2;
      this.output++;
    }
    const next = Math.floor((this.output * this.inputRate) / 16000);
    this.carry = data.slice(next - this.base);
    this.base = next;
    return bytes.slice(0, written);
  }
}
