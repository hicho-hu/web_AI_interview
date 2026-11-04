import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { defaultConfig } from '../../src/features/interviews/schema';
import type { Interview } from '../../src/types/domain';

test.skip(!process.env.LIVE_API, '显式启用 LIVE_API 后使用合成语音验证真实实时链路');

test('真实实时链路：WebSocket 字幕、音频校验复用、流式追问首包与持续录制', async ({ page, request }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    const state = window as unknown as {
      __micContext: AudioContext;
      __micOutput: MediaStreamAudioDestinationNode;
      __answerEnded: number;
      __replyStarted: number;
      __playing: boolean;
    };
    const nativeStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
      if (state.__playing && this.buffer?.sampleRate === 24000 && !state.__replyStarted)
        state.__replyStarted = performance.now();
      if (duration === undefined) nativeStart.call(this, when, offset);
      else nativeStart.call(this, when, offset, duration);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const output = context.createMediaStreamDestination();
      state.__micContext = context;
      state.__micOutput = output;
      return output.stream;
    };
  });
  await page.goto('/login');
  await page.getByLabel('测试账号标识').fill(`realtime-synthetic-${Date.now()}`);
  await page.getByLabel('你的称呼').fill('合成语音验收');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入我的练习空间' }).click();
  await expect(page.getByText('真实后端已连接', { exact: true })).toBeVisible();
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('interview-session')!).state.token as string,
  );
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const createdJob = await request.post('/api/v1/job-profiles', {
      headers,
      data: {
        job_title: '前端工程师 · 合成语音验收',
        jd_text: '负责 React 组件开发与 TypeScript 类型设计，参与页面性能优化和自动化测试。',
        seniority: 'MIDDLE',
      },
    });
    expect(createdJob.ok()).toBe(true);
    const jobId = (await createdJob.json()).data.id;
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/v1/job-profiles/${jobId}`, { headers })).json()).data.status,
        { timeout: 90000 },
      )
      .toBe('READY');
    const created = await request.post('/api/v1/interviews', {
      headers: { ...headers, 'Idempotency-Key': `realtime-${Date.now()}` },
      data: { job_profile_id: jobId, config: { ...defaultConfig, mode: 'VOICE', question_count: 2 } },
    });
    expect(created.ok()).toBe(true);
    const id = (await created.json()).data.interview_id;
    let interview: Interview | undefined;
    await expect
      .poll(
        async () => {
          interview = (await (await request.get(`/api/v1/interviews/${id}`, { headers })).json()).data;
          return interview!.status;
        },
        { timeout: 90000 },
      )
      .toBe('READY');
    expect(interview!.conversation_features?.live_transcription).toBe(true);
    const audioUrl = interview!.current_question!.question_audio!.download_url!;
    const firstTurn = interview!.current_question!.id;
    await page.goto(`/interviews/${id}/room`);
    await page.getByRole('checkbox', { name: /我同意全程录制/ }).check();
    await page.getByRole('button', { name: '开始面试并全程录制' }).click();
    await expect(page.getByRole('heading', { name: '面试官正在提问 · 开口即可打断' })).toBeVisible();
    const streamedReply = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/submit-stream'),
    );
    // Feed only the server-generated, synthetic question audio into the virtual mic.
    // No physical microphone or user audio is read by this test.
    await page.evaluate(async (url) => {
      const state = window as unknown as {
        __micContext: AudioContext;
        __micOutput: MediaStreamAudioDestinationNode;
        __answerEnded: number;
        __playing: boolean;
      };
      const parsed = new URL(url, location.origin);
      const sourceUrl = parsed.pathname.startsWith('/api/v1/local-objects/')
        ? parsed.pathname + parsed.search
        : url;
      const response = await fetch(sourceUrl);
      const buffer = await state.__micContext.decodeAudioData(await response.arrayBuffer());
      const source = state.__micContext.createBufferSource();
      source.buffer = buffer;
      source.connect(state.__micOutput);
      source.onended = () => {
        state.__answerEnded = performance.now();
      };
      state.__playing = true;
      source.start();
    }, audioUrl);
    const subtitle = page.getByRole('log', { name: '实时字幕' });
    await expect(subtitle.locator('strong')).toHaveText('我');
    await expect
      .poll(async () => {
        const text = await subtitle.locator('p').textContent();
        return !!text && text !== '正在识别你的回答…' && text !== '开始后自动显示双方字幕';
      })
      .toBe(true);
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __replyStarted: number }).__replyStarted || 0),
        { timeout: 90000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/v1/interviews/${id}`, { headers })).json()).data.current_question
            .id,
        { timeout: 30000 },
      )
      .not.toBe(firstTurn);
    const metrics = await page.evaluate(() => {
      const state = window as unknown as { __replyStarted: number; __answerEnded: number };
      return {
        synthetic_only: true,
        answer_end_to_first_reply_audio_ms: Math.round(state.__replyStarted - state.__answerEnded),
      };
    });
    const events = (await (await streamedReply).text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; elapsed_ms?: number });
    const measured = {
      ...metrics,
      live_asr_reused: !events.some((event) => event.type === 'transcribing'),
      submitted_to_first_audio_ms: events.find((event) => event.type === 'audio')?.elapsed_ms,
      transcript_to_first_audio_ms:
        (events.find((event) => event.type === 'audio')?.elapsed_ms || 0) -
        (events.find((event) => event.type === 'transcript')?.elapsed_ms || 0),
    };
    await writeFile('test-results/realtime-latency.json', JSON.stringify(measured, null, 2));
    await expect(page.getByText(/全程录制/).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/realtime-live.png', fullPage: true });
    console.info('Synthetic live conversation latency:', JSON.stringify(measured));
  } finally {
    await request.delete('/api/v1/users/me/data', { headers });
  }
});
