import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { signedUrl } from '../src/features/media/urls';

const origin = 'https://121.41.206.87';
const bucket = 'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com';
const path = '/ai-interview/user/10000003/generated/question-a.wav';
const query =
  '?x-oss-security-token=token%2Bpart%2Fvalue%3D&x-oss-date=20261119T153434Z&x-oss-signature=abc123';

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin } });
  vi.stubEnv('VITE_API_BASE_URL', '/api/v1');
  vi.stubEnv('VITE_OSS_AUDIO_MODE', 'proxy');
  vi.stubEnv('VITE_OSS_AUDIO_HOST', 'ai-interview-storage.oss-cn-hangzhou.aliyuncs.com');
  vi.stubEnv('VITE_OSS_RESUME_MODE', 'proxy');
  vi.stubEnv('VITE_OSS_RESUME_HOST', '');
  vi.stubEnv('VITE_OSS_MEDIA_MODE', 'proxy');
  vi.stubEnv('VITE_OSS_MEDIA_HOST', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('routes signed WAV and MP3 questions through the page origin without re-encoding the signature', () => {
  expect(signedUrl(bucket + path + query)).toBe(origin + path + query);
  expect(signedUrl(bucket + path.replace('.wav', '.mp3') + query)).toBe(
    origin + path.replace('.wav', '.mp3') + query,
  );
});

it('does not redirect other hosts, other object types or uploads', () => {
  for (const url of [
    'https://other-bucket.example.com' + path + query,
    bucket + '.example.com' + path + query,
    bucket + path.replace('/generated/', '/incoming/') + query,
    bucket + path.replace('.wav', '.pdf') + query,
    bucket + path.replace('question-a.wav', 'nested/question-a.wav') + query,
  ])
    expect(signedUrl(url)).toBe(url);
});

it('proxies every accepted backend file type, including cloud captions, avatars and recordings', () => {
  for (const extension of [
    'pdf',
    'docx',
    'png',
    'jpg',
    'jpeg',
    'wav',
    'mp3',
    'm4a',
    'mp4',
    'aac',
    'webm',
    'vtt',
  ]) {
    const key = `/ai-interview/user/legacy-owner/accepted/asset-a.${extension}`;
    expect(signedUrl(bucket + key + query)).toBe(origin + key + query);
  }
});

it('supports an independent accepted-media bucket and explicit direct mode', () => {
  vi.stubEnv('VITE_OSS_MEDIA_HOST', 'media-bucket.oss-cn-shanghai.aliyuncs.com');
  const key = '/ai-interview/user/10000003/accepted/recording.webm';
  const url = 'https://media-bucket.oss-cn-shanghai.aliyuncs.com' + key + query;
  expect(signedUrl(url)).toBe(origin + key + query);
  vi.stubEnv('VITE_OSS_MEDIA_MODE', 'direct');
  expect(signedUrl(url)).toBe(url);
});

it('normalizes IPv6 loopback local objects without changing the signed query', () => {
  expect(signedUrl('http://[::1]:8000/api/v1/local-objects/asset?signature=synthetic')).toBe(
    origin + '/api/v1/local-objects/asset?signature=synthetic',
  );
});

it('supports an explicitly configured audio bucket and direct playback', () => {
  vi.stubEnv('VITE_OSS_AUDIO_HOST', 'custom-bucket.oss-cn-shanghai.aliyuncs.com');
  const url = 'https://custom-bucket.oss-cn-shanghai.aliyuncs.com' + path + query;
  expect(signedUrl(url)).toBe(origin + path + query);
  vi.stubEnv('VITE_OSS_AUDIO_MODE', 'direct');
  expect(signedUrl(url)).toBe(url);
});

it('preserves relative fixtures and the existing local backend object URL rewrite', () => {
  expect(signedUrl('/fixtures/question.wav')).toBe(origin + '/fixtures/question.wav');
  expect(signedUrl('http://127.0.0.1:8000/api/v1/local-objects/asset?token=synthetic')).toBe(
    origin + '/api/v1/local-objects/asset?token=synthetic',
  );
});

it('routes accepted PDF and DOCX resumes to the page origin with the raw signed query', () => {
  for (const extension of ['pdf', 'docx']) {
    const resumePath = `/ai-interview/user/10000003/accepted/resume-a.${extension}`;
    expect(signedUrl(bucket + resumePath + query)).toBe(origin + resumePath + query);
  }
  vi.stubEnv('VITE_OSS_AUDIO_MODE', 'direct');
  const resumePath = '/ai-interview/user/10000003/accepted/resume-a.pdf';
  expect(signedUrl(bucket + resumePath + query)).toBe(origin + resumePath + query);
});

it('keeps resume direct mode independent and supports a configured resume bucket', () => {
  const resumePath = '/ai-interview/user/10000003/accepted/resume-a.docx';
  vi.stubEnv('VITE_OSS_RESUME_HOST', 'resume-bucket.oss-cn-shanghai.aliyuncs.com');
  const url = 'https://resume-bucket.oss-cn-shanghai.aliyuncs.com' + resumePath + query;
  expect(signedUrl(url)).toBe(origin + resumePath + query);
  vi.stubEnv('VITE_OSS_RESUME_MODE', 'direct');
  expect(signedUrl(url)).toBe(url);
  expect(signedUrl(bucket + path + query)).toBe(origin + path + query);
});

it('does not proxy arbitrary resume hosts, incoming files, nested paths or executable formats', () => {
  const resumePath = '/ai-interview/user/10000003/accepted/resume-a.pdf';
  for (const url of [
    'https://other.example.com' + resumePath + query,
    bucket + resumePath.replace('/accepted/', '/incoming/') + query,
    bucket + resumePath.replace('resume-a.pdf', 'nested/resume-a.pdf') + query,
    bucket + resumePath.replace('.pdf', '.html') + query,
    bucket + resumePath.replace('.pdf', '.svg') + query,
  ])
    expect(signedUrl(url)).toBe(url);
});
