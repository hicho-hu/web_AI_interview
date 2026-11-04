import { describe, expect, it, vi } from 'vitest';
import { joinUtterances, Pcm16Encoder, VoiceActivity, wavBlob } from '../src/features/media/voiceActivity';
describe('连续对话语音边界', () => {
  it('过滤短噪声，开口触发一次打断，完整停顿后提交一次回答', () => {
    const start = vi.fn(),
      end = vi.fn();
    const detector = new VoiceActivity(16000, start, end);
    detector.enabled = true;
    const voice = new Float32Array(1600).fill(0.1),
      silence = new Float32Array(1600);
    detector.push(voice);
    detector.push(silence);
    expect(start).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) detector.push(voice);
    expect(start).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 15; i++) detector.push(silence);
    expect(end).not.toHaveBeenCalled();
    detector.push(silence);
    expect(end).toHaveBeenCalledTimes(1);
    expect(end.mock.calls[0][0].durationMs).toBeGreaterThan(2000);
  });
  it('分析期间不重复提交，暂停后清空未完成边界', () => {
    const end = vi.fn();
    const detector = new VoiceActivity(16000, vi.fn(), end);
    for (let i = 0; i < 20; i++) detector.push(new Float32Array(1600).fill(0.2));
    detector.flush();
    expect(end).not.toHaveBeenCalled();
    detector.enabled = true;
    for (let i = 0; i < 8; i++) detector.push(new Float32Array(1600).fill(0.2));
    detector.enabled = false;
    detector.push(new Float32Array(1600));
    detector.flush();
    expect(end).not.toHaveBeenCalled();
  });
  it('提交可独立解码的单声道 16 kHz WAV，不把 WebM 任意片段当文件', async () => {
    const blob = wavBlob(new Float32Array(48000).fill(0.2), 48000),
      view = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(32000);
    expect(blob.size).toBe(32044);
  });
  it('上传期间继续开口会等到下一次停顿，短噪声或暂停也会解除等待', async () => {
    const detector = new VoiceActivity(16000, vi.fn(), vi.fn());
    detector.enabled = true;
    const voice = new Float32Array(1600).fill(0.1);
    for (let i = 0; i < 8; i++) detector.push(voice);
    const idle = vi.fn();
    const wait = detector.waitForSilence().then(idle);
    await Promise.resolve();
    expect(idle).not.toHaveBeenCalled();
    for (let i = 0; i < 16; i++) detector.push(new Float32Array(1600));
    await wait;
    expect(idle).toHaveBeenCalledOnce();
    detector.push(voice);
    detector.push(voice);
    const short = detector.waitForSilence();
    detector.flush();
    await short;
    expect(detector.active).toBe(false);
    for (let i = 0; i < 8; i++) detector.push(voice);
    const paused = detector.waitForSilence();
    detector.reset();
    await paused;
  });
  it('补充回答按顺序合并并使用实际 PCM 时长', async () => {
    const parts = [0.1, 0.3].map((sample) => ({
      samples: new Float32Array(16000).fill(sample),
      sampleRate: 16000,
      durationMs: 1000,
    }));
    const merged = joinUtterances(parts);
    expect(merged.durationMs).toBe(2000);
    expect(merged.samples.length).toBe(32000);
    expect(merged.samples[0]).toBeCloseTo(0.1);
    expect(merged.samples[16000]).toBeCloseTo(0.3);
    const view = new DataView(await wavBlob(merged.samples, merged.sampleRate).arrayBuffer());
    expect(view.getUint32(40, true)).toBe(64000);
  });
  it.each([44100, 48000])('流式 PCM 与完整 WAV 一致，%i Hz 分块不丢采样', async (rate) => {
    const samples = Float32Array.from({ length: rate * 2 + 117 }, (_, i) => Math.sin(i * 0.13) * 0.2);
    const encoder = new Pcm16Encoder(rate),
      pieces: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += 2048) pieces.push(encoder.push(samples.slice(i, i + 2048)));
    const streamed = new Uint8Array(pieces.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of pieces) {
      streamed.set(part, offset);
      offset += part.length;
    }
    expect(streamed).toEqual(new Uint8Array(await wavBlob(samples, rate).arrayBuffer()).slice(44));
  });
  it('快速接续在约 800 ms 静音后触发，较短自然停顿继续收音', () => {
    const end = vi.fn(),
      detector = new VoiceActivity(16000, vi.fn(), end, { silenceMs: 800 });
    detector.enabled = true;
    for (let i = 0; i < 10; i++) detector.push(new Float32Array(1600).fill(0.2));
    for (let i = 0; i < 7; i++) detector.push(new Float32Array(1600));
    expect(end).not.toHaveBeenCalled();
    detector.push(new Float32Array(1600));
    expect(end).toHaveBeenCalledOnce();
  });
});
