import { test, expect } from '@playwright/test';
import type { Config, Interview, MediaAsset, Turn, UploadInput, User } from '../../src/types/domain';

function questionWav() {
  const frames = 16000 * 8,
    buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    buffer.writeInt16LE(Math.round(Math.sin((i / 16000) * Math.PI * 2 * 440) * 1800), 44 + i * 2);
  return buffer;
}

for (const mode of ['VOICE', 'VIDEO'] as const) {
  for (const ending of ['automatic', 'manual', 'backup-failure'] as const) {
    if (mode === 'VIDEO' && ending === 'backup-failure') continue;
    for (const transport of ['legacy', 'stream'] as const) {
      if (transport === 'stream' && ending === 'backup-failure') continue;
      test(`${mode} ${ending} ${transport} 连续面试：打断、补充、暂停、整场记录与回放`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(() => {
          const globals = window as unknown as {
            __micGain: GainNode;
            __micContext: AudioContext;
            __starts: string[];
            __stops: string[];
            __interruptions: number;
            __recordingCanvases: HTMLCanvasElement[];
          };
          globals.__starts = [];
          globals.__stops = [];
          globals.__interruptions = 0;
          globals.__recordingCanvases = [];
          const captureCanvas = HTMLCanvasElement.prototype.captureStream;
          HTMLCanvasElement.prototype.captureStream = function (rate?: number) {
            globals.__recordingCanvases.push(this);
            return captureCanvas.call(this, rate);
          };
          const NativeRecorder = window.MediaRecorder;
          window.MediaRecorder = class extends NativeRecorder {
            start(timeslice?: number) {
              globals.__starts.push(this.mimeType);
              super.start(timeslice);
            }
            stop() {
              globals.__stops.push(this.mimeType);
              super.stop();
            }
          };
          const stop = AudioBufferSourceNode.prototype.stop;
          AudioBufferSourceNode.prototype.stop = function (when?: number) {
            globals.__interruptions++;
            stop.call(this, when);
          };
          const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async (constraints) => {
            const native = await getUserMedia(constraints);
            native.getAudioTracks().forEach((t) => t.stop());
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            oscillator.frequency.value = 880;
            const gain = context.createGain();
            gain.gain.value = 0;
            const destination = context.createMediaStreamDestination();
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();
            await context.resume();
            globals.__micGain = gain;
            globals.__micContext = context;
            return new MediaStream([...native.getVideoTracks(), ...destination.stream.getAudioTracks()]);
          };
          // The human screen chooser is replaced with a clearly synthetic screen in this test only.
          navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext('2d')!;
            const draw = () => {
              ctx.fillStyle = '#253455';
              ctx.fillRect(0, 0, 640, 360);
              ctx.fillStyle = '#fff';
              ctx.font = '24px sans-serif';
              ctx.fillText(`Synthetic interview screen ${Date.now()}`, 20, 180);
              requestAnimationFrame(draw);
            };
            draw();
            return canvas.captureStream(24);
          };
        });
        if (transport === 'stream')
          await page.addInitScript(() => {
            const nativeFetch = window.fetch.bind(window);
            window.fetch = async (...args) => {
              const response = await nativeFetch(...args);
              if (!String(args[0]).includes('/submit-stream')) return response;
              const { data } = await response.json();
              const encoder = new TextEncoder();
              const stream = new ReadableStream({
                async start(controller) {
                  for (const entry of data.events) {
                    await new Promise((resolve) => setTimeout(resolve, entry.delay));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry.event)}\n\n`));
                  }
                  controller.close();
                },
              });
              return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
            };
            class FakeSocket {
              static OPEN = 1;
              readyState = 0;
              bufferedAmount = 0;
              onopen: (() => void) | null = null;
              onmessage: ((event: { data: string }) => void) | null = null;
              onerror: (() => void) | null = null;
              onclose: (() => void) | null = null;
              captioned = false;
              constructor() {
                setTimeout(() => {
                  this.readyState = 1;
                  this.onopen?.();
                }, 10);
              }
              send(data: string | Uint8Array) {
                const emit = (event: object) => this.onmessage?.({ data: JSON.stringify(event) });
                if (typeof data === 'string') {
                  const event = JSON.parse(data);
                  if (event.token) setTimeout(() => emit({ type: 'ready' }), 10);
                  if (event.type === 'finish')
                    setTimeout(
                      () =>
                        emit({
                          type: 'complete',
                          transcript_id: '00000000-0000-0000-0000-000000000001',
                          text: '我负责组件开发与项目验证。',
                        }),
                      10,
                    );
                } else if (!this.captioned) {
                  this.captioned = true;
                  emit({ type: 'caption', text: '我负责组件开发', final: false });
                }
              }
              close() {
                this.readyState = 3;
                this.onclose?.();
              }
            }
            window.WebSocket = FakeSocket as unknown as typeof WebSocket;
          });
        const user: User = {
          id: 'continuous-test',
          nickname: '连续对话验证',
          status: 'ACTIVE',
          remaining_interviews: 3,
          created_at: new Date().toISOString(),
        };
        const config: Config = {
          mode,
          duration_minutes: 15,
          difficulty: 'MEDIUM',
          question_count: 2,
          language: 'zh-CN',
          allow_follow_up: false,
          max_follow_ups: 0,
          max_clarifications: 1,
          interview_type: 'COMPREHENSIVE',
        };
        const questionAudio: MediaAsset = {
          id: 'question-audio',
          media_type: 'AUDIO',
          status: 'READY',
          content_type: 'audio/wav',
          download_url: '/fixtures/question.wav',
          duration_ms: 8000,
        };
        const turn: Turn = {
          id: 'turn-1',
          turn_no: 1,
          main_index: 0,
          turn_type: 'MAIN',
          parent_turn_id: null,
          competency: '专业深度',
          question: '请介绍你的一个真实项目。',
          status: 'WAITING_ANSWER',
          transcript: null,
          task_id: null,
          question_audio: questionAudio,
          answer_media: null,
        };
        const item: Interview = {
          conversation_features: {
            streaming_answers: transport === 'stream',
            live_transcription: transport === 'stream',
          },
          id: 'continuous-fixture',
          job_profile_id: 'job',
          job_title: '连续面试验证',
          mode,
          config,
          status: 'READY',
          resume_asset_id: null,
          current_turn_no: 1,
          elapsed_seconds: 0,
          created_at: user.created_at,
          started_at: null,
          ended_at: null,
          current_question: turn,
          prepare_task_id: null,
          report_task_id: null,
          overall_score: null,
          failure_code: null,
          version: 1,
        };
        const answers: string[] = [],
          completedTurns: Turn[] = [];
        const assets = new Map<string, { input: UploadInput; blob?: Buffer; ready?: boolean }>();
        let expired = false;
        let releaseAnswerUpload: (() => void) | undefined;
        let delayedAnswer = false;
        let rejectSessionUploads = ending === 'backup-failure';
        await page.route('**/fixtures/question.wav', (route) =>
          route.fulfill({ contentType: 'audio/wav', body: questionWav() }),
        );
        await page.route('**/api/v1/**', async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          let data: unknown = {};
          if (path.endsWith('/auth/dev-login')) data = { access_token: 'fixture', expires_in: 3600, user };
          else if (path.endsWith('/users/me/consents'))
            data = request.method() === 'GET' ? { policy_version: '1.0', items: [] } : {};
          else if (path.endsWith('/users/me')) data = user;
          else if (path.endsWith('/media/upload-url')) {
            const input = request.postDataJSON() as UploadInput;
            if (rejectSessionUploads && input.media_type.startsWith('SESSION_')) {
              await route.fulfill({
                status: 503,
                json: { code: 'UPLOAD_UNAVAILABLE', message: '测试保存失败' },
              });
              return;
            }
            const id = `asset-${assets.size + 1}`;
            assets.set(id, { input });
            if (input.media_type === 'AUDIO') {
              expect(input.content_type).toBe('audio/wav');
              expect(input.turn_id).toBeTruthy();
            } else {
              expect(input.media_type).toMatch(/^SESSION_/);
              expect(input.turn_id).toBeUndefined();
            }
            data = {
              asset_id: id,
              upload_url: `/api/v1/local-objects/${id}`,
              method: 'PUT',
              headers: { 'Content-Type': input.content_type },
              expires_in: 600,
            };
          } else if (path.includes('/local-objects/')) {
            const id = path.split('/').at(-1)!,
              asset = assets.get(id)!;
            if (request.method() === 'GET') {
              await route.fulfill({ contentType: asset.input.content_type, body: asset.blob! });
              return;
            }
            if (!expired && asset.input.media_type === 'SESSION_AUDIO') {
              expired = true;
              await route.fulfill({ status: 403, body: 'expired signature' });
              return;
            }
            if (!delayedAnswer && asset.input.media_type === 'AUDIO') {
              delayedAnswer = true;
              await new Promise<void>((resolve) => {
                releaseAnswerUpload = resolve;
              });
            }
            asset.blob = request.postDataBuffer()!;
            expect(asset.blob.length).toBe(asset.input.size);
          } else if (/\/media\/asset-\d+\/complete$/.test(path)) {
            assets.get(path.split('/').at(-2)!)!.ready = true;
          } else if (path.endsWith('/media'))
            data = {
              items: [...assets.entries()]
                .filter(([, a]) => a.ready)
                .map(([id, a]) => ({
                  id,
                  media_type: a.input.media_type,
                  status: 'READY',
                  content_type: a.input.content_type,
                  download_url: `/api/v1/local-objects/${id}`,
                  duration_ms: a.input.duration_ms,
                })),
              total: [...assets.values()].filter((a) => a.ready).length,
              page: 1,
              page_size: 100,
            };
          else if (path.endsWith('/start')) {
            item.status = 'IN_PROGRESS';
            item.started_at = new Date().toISOString();
            data = item;
          } else if (path.endsWith('/pause')) {
            item.status = 'PAUSED';
            data = item;
          } else if (path.endsWith('/resume')) {
            item.status = 'IN_PROGRESS';
            data = item;
          } else if (path.endsWith('/finish')) {
            item.status = 'COMPLETED';
            item.ended_at = new Date().toISOString();
            data = item;
          } else if (/\/turns\/turn-\d+\/(submit|submit-stream)$/.test(path)) {
            const asset = assets.get(request.postDataJSON().asset_id)!;
            expect(asset.ready).toBe(true);
            expect(request.headers()['idempotency-key']).toBeTruthy();
            const turnId = path.split('/').at(-2)!;
            answers.push(turnId);
            completedTurns.push({
              ...item.current_question!,
              status: 'COMPLETED',
              transcript: '合成麦克风信号对应的测试转写。',
            });
            if (answers.length === 1)
              item.current_question = {
                ...turn,
                id: 'turn-2',
                turn_no: 2,
                main_index: 1,
                question: '接下来，谈谈你如何验证项目结果。',
              };
            else {
              if (ending === 'automatic') {
                item.status = 'COMPLETED';
                item.ended_at = new Date().toISOString();
              }
              item.current_question = { ...item.current_question!, status: 'COMPLETED' };
            }
            data = { task_id: 'processed', processing_status: 'SUBMITTED' };
            if (path.endsWith('/submit-stream')) {
              const caption = { type: 'transcript', turn_id: turnId, text: '合成麦克风信号对应的测试转写。' };
              const next = item.current_question!;
              const pcm = Buffer.alloc(24000);
              for (let j = 0; j < pcm.length / 2; j++)
                pcm.writeInt16LE(Math.round(Math.sin((j / 24000) * Math.PI * 2 * 440) * 2500), j * 2);
              const sequence = [
                { delay: 0, event: { type: 'accepted' } },
                { delay: 10, event: caption },
              ];
              if (answers.length === 1) {
                sequence.push({
                  delay: 20,
                  event: {
                    type: 'question',
                    turn_id: next.id,
                    text: next.question,
                    turn_no: next.turn_no,
                    main_index: next.main_index,
                    turn_type: next.turn_type,
                    competency: next.competency,
                  },
                } as (typeof sequence)[number]);
                sequence.push({
                  delay: 0,
                  event: { type: 'audio_reset', turn_id: next.id },
                } as (typeof sequence)[number]);
                for (let j = 0; j < 3; j++)
                  sequence.push({
                    delay: 70,
                    event: {
                      type: 'audio',
                      turn_id: next.id,
                      pcm: pcm.toString('base64'),
                      sample_rate: 24000,
                    },
                  } as (typeof sequence)[number]);
                sequence.push({
                  delay: 10,
                  event: { type: 'audio_end', turn_id: next.id },
                } as (typeof sequence)[number]);
              }
              sequence.push({
                delay: answers.length === 1 ? 2300 : 20,
                event: { type: 'complete', interview: structuredClone(item) },
              } as (typeof sequence)[number]);
              data = { events: sequence };
            }
          } else if (path.endsWith('/turns')) data = { items: completedTurns };
          else if (path.endsWith('/report')) data = { status: item.status, report: null };
          else if (path.endsWith('/interviews/continuous-fixture')) data = item;
          else if (path.endsWith('/interviews')) data = { items: [], total: 0, page: 1, page_size: 100 };
          await route.fulfill({
            json: { code: 'OK', message: 'success', data, request_id: 'continuous-fixture' },
          });
        });
        await page.goto('/login');
        await page.getByLabel('测试账号标识').fill('continuous-fixture');
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: '进入我的练习空间' }).click();
        await expect(page.getByText('真实后端已连接', { exact: true })).toBeVisible();
        if (ending === 'backup-failure') {
          await page.addInitScript(() => {
            Object.defineProperty(window, 'indexedDB', {
              value: {
                open() {
                  throw new Error('测试本地备份不可用');
                },
              },
            });
          });
        }
        await page.goto('/interviews/continuous-fixture/room');
        await expect(page.getByRole('button', { name: '开始面试并全程录制' })).toBeDisabled();
        await page.getByRole('checkbox', { name: /我同意全程录制/ }).check();
        await page.getByRole('button', { name: '开始面试并全程录制' }).click();
        await expect(page.getByRole('heading', { name: '面试官正在提问 · 开口即可打断' })).toBeVisible();
        if (mode === 'VIDEO') {
          expect(
            await page.evaluate(() =>
              (
                window as unknown as { __recordingCanvases: HTMLCanvasElement[] }
              ).__recordingCanvases.includes(
                document.querySelector('.interview-scene canvas') as HTMLCanvasElement,
              ),
            ),
          ).toBe(true);
          await page.screenshot({ path: 'test-results/video-split-room.png', fullPage: true });
        }
        await page.getByRole('button', { name: '暂停对话', exact: true }).click();
        await expect(page.getByRole('heading', { name: '对话已暂停 · 整场录制持续进行' })).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __stops: string[] }).__stops.length)).toBe(
          0,
        );
        await page.getByRole('button', { name: '继续对话', exact: true }).click();
        for (let i = 0; i < 2; i++) {
          await expect(page.getByRole('heading', { name: '面试官正在提问 · 开口即可打断' })).toBeVisible();
          await page.evaluate(async () => {
            const g = window as unknown as { __micGain: GainNode; __micContext: AudioContext };
            await g.__micContext.resume();
            g.__micGain.gain.value = 0.12;
            await new Promise((r) => setTimeout(r, 1000));
            g.__micGain.gain.value = 0;
          });
          if (transport === 'stream')
            await expect(page.getByRole('log', { name: '实时字幕' })).toContainText('我负责组件开发');
          if (i === 0) {
            await expect.poll(() => !!releaseAnswerUpload).toBe(true);
            // Resume during the upload, then let that upload complete during speech.
            await page.evaluate(() => {
              (window as unknown as { __micGain: GainNode }).__micGain.gain.value = 0.12;
            });
            await expect(page.getByRole('heading', { name: '正在聆听你的回答' })).toBeVisible();
            releaseAnswerUpload!();
            await page.evaluate(async () => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              (window as unknown as { __micGain: GainNode }).__micGain.gain.value = 0;
            });
          } else if (ending !== 'automatic') {
            // Stop before VAD's silence timeout to flush the final sentence.
            await page.getByRole('button', { name: '结束面试并保存', exact: true }).click();
          }
          await expect.poll(() => answers.length).toBe(i + 1);
          if (i === 0) {
            await expect(
              page
                .locator('.conversation-question')
                .getByText('接下来，谈谈你如何验证项目结果。', { exact: true }),
            ).toBeVisible();
            expect(
              await page.evaluate(() => (window as unknown as { __stops: string[] }).__stops.length),
            ).toBe(0);
          }
        }
        if (ending === 'backup-failure') {
          await expect(page.getByText('待保存 · 请先下载', { exact: true })).toBeVisible();
          await expect(page).toHaveURL(/\/room$/);
          const download = page.waitForEvent('download');
          await page.getByRole('link', { name: '下载录音', exact: true }).click();
          expect((await download).suggestedFilename()).toContain('-audio.webm');
          rejectSessionUploads = false;
          await page.getByRole('button', { name: '继续生成报告', exact: true }).click();
        }
        await expect(page).toHaveURL(/\/report$/);
        await expect(page.getByLabel('整场面试语音回放')).toBeVisible();
        await expect(page.getByRole('link', { name: '下载字幕', exact: true })).toBeVisible();
        const full = [...assets.values()].filter((a) => a.ready && a.input.media_type.startsWith('SESSION_'));
        const firstAnswerParts = [...assets.values()].filter(
          (a) => a.input.media_type === 'AUDIO' && a.input.turn_id === 'turn-1',
        );
        expect(firstAnswerParts).toHaveLength(2);
        expect(firstAnswerParts[1].input.duration_ms!).toBeGreaterThan(
          firstAnswerParts[0].input.duration_ms! + 1000,
        );
        expect(full.filter((a) => a.input.media_type === 'SESSION_AUDIO')).toHaveLength(1);
        expect(full.filter((a) => a.input.media_type === 'SESSION_VIDEO')).toHaveLength(
          mode === 'VIDEO' ? 1 : 0,
        );
        const counts = await page.evaluate(() => {
          const g = window as unknown as { __starts: string[]; __stops: string[]; __interruptions: number };
          return { starts: g.__starts.length, stops: g.__stops.length, interruptions: g.__interruptions };
        });
        expect(counts.starts).toBe(mode === 'VIDEO' ? 2 : 1);
        expect(counts.stops).toBe(counts.starts);
        expect(counts.interruptions).toBeGreaterThanOrEqual(2);
        const fullAudio = full.find((a) => a.input.media_type === 'SESSION_AUDIO')!;
        // Decode the real MediaRecorder result and verify both speakers in the mix.
        const tones = await page.evaluate(
          async (bytes) => {
            const context = new AudioContext();
            try {
              const audio = await context.decodeAudioData(new Uint8Array(bytes).buffer);
              const samples = audio.getChannelData(0),
                rate = audio.sampleRate;
              const peak = (hz: number) => {
                let maximum = 0;
                const length = Math.floor(rate / 10);
                for (let start = 0; start + length < samples.length; start += length) {
                  let real = 0,
                    imaginary = 0;
                  for (let i = 0; i < length; i++) {
                    const angle = (2 * Math.PI * hz * i) / rate;
                    real += samples[start + i] * Math.cos(angle);
                    imaginary += samples[start + i] * Math.sin(angle);
                  }
                  maximum = Math.max(maximum, (2 * Math.hypot(real, imaginary)) / length);
                }
                return maximum;
              };
              return { interviewer: peak(440), candidate: peak(880) };
            } finally {
              await context.close();
            }
          },
          [...fullAudio.blob!],
        );
        expect(tones.interviewer).toBeGreaterThan(0.01);
        expect(tones.candidate).toBeGreaterThan(0.03);
        if (mode === 'VIDEO') {
          await expect(page.getByLabel('整场面试视频回放')).toBeVisible();
          await expect
            .poll(() =>
              page
                .getByLabel('整场面试视频回放')
                .evaluate((el) => Number.isFinite((el as HTMLVideoElement).duration)),
            )
            .toBe(true);
        }
        await page.reload();
        await expect(page.getByLabel('整场面试语音回放')).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  }
}
