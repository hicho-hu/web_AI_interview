import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/services/api', () => ({ api: {} }));
import { signedUrl } from '../src/features/media/upload';

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

it('does not redirect other hosts, other object types, uploads or accepted recordings', () => {
  for (const url of [
    'https://other-bucket.example.com' + path + query,
    bucket + '.example.com' + path + query,
    bucket + path.replace('/generated/', '/incoming/') + query,
    bucket + path.replace('/generated/', '/accepted/') + query,
    bucket + path.replace('.wav', '.pdf') + query,
    bucket + path.replace('question-a.wav', 'nested/question-a.wav') + query,
  ])
    expect(signedUrl(url)).toBe(url);
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
