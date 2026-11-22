import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { User } from '../../src/types/domain';

test.skip(!process.env.PRODUCTION_PREVIEW, '验证生产产物与实际 CSP 下的文件入口');
test.skip(!process.env.SYNTHETIC_OSS, '使用 npm run test:e2e:production 启动合成 OSS 上游');
const bucket = 'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com';
const owner = '/ai-interview/user/10000003/accepted/';
const query = (version = 1) =>
  `?x-oss-security-token=synthetic%2Btoken%2Fvalue%3D&x-oss-signature=grant-${version}`;
const user: User = {
  id: 'cloud-media-user',
  uid: '10000003',
  nickname: '合成媒体检查',
  status: 'ACTIVE',
  remaining_interviews: 3,
  created_at: '2026-11-22T00:00:00Z',
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII=',
  'base64',
);

async function setup(page: Page, origin: string, currentUser: User, data: (path: string) => unknown) {
  const csp = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8').match(
    /add_header Content-Security-Policy "([^"]+)"/,
  )![1];
  await page.addInitScript((currentUser) => {
    if (window.top !== window) return;
    sessionStorage.setItem(
      'interview-session',
      JSON.stringify({ state: { token: 'synthetic', user: currentUser, mode: 'live' }, version: 0 }),
    );
    const blocked: string[] = [];
    (window as unknown as { __mediaBlocked: string[] }).__mediaBlocked = blocked;
    document.addEventListener('securitypolicyviolation', (event) => {
      if (
        ['img-src', 'connect-src', 'media-src', 'frame-src', 'object-src'].includes(event.effectiveDirective)
      )
        blocked.push(event.effectiveDirective);
    });
  }, currentUser);
  await page.route(
    (url) =>
      url.origin === origin &&
      ['/profile', '/invitations', '/interviews/cloud-media/report'].includes(url.pathname),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    },
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith('/users/me')
      ? currentUser
      : path.endsWith('/users/me/consents')
        ? { policy_version: '1.0', items: [] }
        : data(path);
    await route.fulfill({
      json: { code: 'OK', message: 'success', data: result, request_id: 'media-audit' },
    });
  });
  await page.route(`${bucket}/**`, (route) => route.abort('accessdenied'));
}

test('生产头像：导航、个人资料、头像设置和邀请好友都使用同源图片', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const avatar = owner + 'avatar.png';
  const friend = '/ai-interview/user/10000004/accepted/friend.jpg';
  await setup(page, origin, { ...user, avatar_url: bucket + avatar + query() }, (path) => {
    if (path.endsWith('/invitations/me'))
      return {
        code: 'SYNTHETIC',
        url: origin + '/register?invite=SYNTHETIC',
        valid_invites: 1,
        reward_count: 0,
        next_reward_in: 1,
        rules: { enabled: false },
        recent: [
          {
            id: 'friend',
            nickname: '合成好友',
            registered_at: user.created_at,
            status: 'REGISTERED',
            avatar_url: bucket + friend + query(),
          },
        ],
      };
    return { items: [], total: 0, page: 1, page_size: 100 };
  });
  const images: string[] = [];
  await page.route(
    (url) => url.origin === origin && [avatar, friend].includes(url.pathname),
    (route) => {
      images.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: png });
    },
  );
  await page.goto('/profile');
  const own = page.locator('img[alt="我的头像"], img[alt="当前头像"]');
  await expect.poll(() => own.count()).toBeGreaterThan(1);
  await expect
    .poll(() =>
      own.evaluateAll((elements) =>
        elements.every(
          (element) =>
            (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  for (const src of await own.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLImageElement).src),
  ))
    expect(src).toBe(origin + avatar + query());
  await page.goto('/invitations');
  const invited = page.locator('.invitation-friend-row img');
  await expect(invited).toHaveAttribute('src', origin + friend + query());
  await expect.poll(() => invited.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1);
  expect(images).toContain(origin + avatar + query());
  expect(images).toContain(origin + friend + query());
  expect(
    await page.evaluate(() => (window as unknown as { __mediaBlocked: string[] }).__mediaBlocked),
  ).toEqual([]);
});

function wav() {
  const frames = 16000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i * Math.PI * 440) / 8000) * 1500), 44 + i * 2);
  return bytes;
}

test('生产云端回放：新浏览器读取字幕、音视频，刷新过期链接并下载正确文件', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#3d65ec';
      context.fillRect(0, 0, 160, 90);
      const stream = canvas.captureStream(12);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start(50);
      const timer = setInterval(() => context.fillRect(0, 0, 160, 90), 50);
      await new Promise((resolve) => setTimeout(resolve, 400));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    }),
  );
  const audio = wav();
  const captions = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\n面试官：合成云端字幕\n';
  mkdirSync('test-results/production-objects', { recursive: true });
  writeFileSync('test-results/production-objects/session.wav', audio);
  writeFileSync('test-results/production-objects/session.webm', video);
  writeFileSync('test-results/production-objects/session.vtt', captions);
  let versions = 0;
  const fileRequests: string[] = [];
  await setup(page, origin, user, (path) => {
    if (path.endsWith('/media')) {
      versions++;
      return {
        items: [
          {
            id: 'audio',
            media_type: 'SESSION_AUDIO',
            status: 'READY',
            content_type: 'audio/wav',
            duration_ms: 1000,
            download_url: bucket + owner + 'session.wav' + query(versions),
          },
          {
            id: 'video',
            media_type: 'SESSION_VIDEO',
            status: 'READY',
            content_type: 'video/webm',
            duration_ms: 1000,
            download_url: bucket + owner + 'session.webm' + query(versions),
          },
          {
            id: 'captions',
            media_type: 'SESSION_CAPTIONS',
            status: 'READY',
            content_type: 'text/vtt',
            download_url: bucket + owner + 'session.vtt' + query(versions),
          },
        ],
        total: 3,
        page: 1,
        page_size: 100,
      };
    }
    if (path.endsWith('/experience-feedback'))
      return { feedback: { id: 'already-reviewed' }, dimensions: {} };
    if (path.endsWith('/report'))
      return {
        status: 'COMPLETED',
        report: {
          id: 'report',
          version: 1,
          overall_score: null,
          job_match_feedback: '合成媒体审查',
          dimensions: [],
          reviews: [],
          strengths: [],
          gaps: [],
          recommendations: [],
          practice_questions: [],
          disclaimer: '仅用于测试。',
          is_mock: true,
          model: 'fixture',
          original_turns: [],
          created_at: user.created_at,
        },
      };
    if (path.endsWith('/interviews/cloud-media'))
      return {
        id: 'cloud-media',
        job_title: '合成云端回放',
        status: 'COMPLETED',
        mode: 'VIDEO',
        config: { language: 'zh-CN' },
      };
    throw new Error(`Unexpected cloud media API: ${path}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith(owner)) fileRequests.push(url.href);
  });
  await page.goto('/interviews/cloud-media/report');
  await page.getByRole('tab', { name: '面试回放', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('回放文件读取失败或链接已过期');
  await page.getByRole('button', { name: '刷新回放链接', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const player = page.getByLabel('整场面试语音回放');
  await expect
    .poll(() => player.evaluate((element) => (element as HTMLAudioElement).readyState))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.getByLabel('整场面试视频回放').evaluate((element) => (element as HTMLVideoElement).videoWidth),
    )
    .toBe(160);
  await expect(page.getByLabel('回放字幕')).toContainText('合成云端字幕');
  expect(versions).toBeGreaterThanOrEqual(2);
  await expect(player).toHaveAttribute('src', origin + owner + 'session.wav' + query(versions));
  for (const [label, extension, bytes] of [
    ['下载录音', 'wav', audio],
    ['下载录像', 'webm', video],
  ] as const) {
    const pending = page.waitForEvent('download');
    await page.getByRole('link', { name: label, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      `interview-cloud-media-${extension === 'wav' ? 'audio' : 'video'}.${extension}`,
    );
    expect(readFileSync((await download.path())!)).toEqual(bytes);
  }
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载字幕', exact: true }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toContain('合成云端字幕');
  expect(fileRequests.some((url) => url.includes('session.vtt'))).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { __mediaBlocked: string[] }).__mediaBlocked),
  ).toEqual([]);
});
