import { beforeEach, expect, it, vi } from 'vitest';
import type { OSSCredentials, UploadInput, UploadTicket } from '../src/types/domain';

const sdk = vi.hoisted(() => ({ create: vi.fn(), put: vi.fn(), multipartUpload: vi.fn() }));
vi.mock('ali-oss', () => ({
  default: class {
    put = sdk.put;
    multipartUpload = sdk.multipartUpload;
    constructor(options: unknown) {
      sdk.create(options);
    }
  },
}));
vi.mock('../src/services/api', () => ({
  api: { uploadTicket: vi.fn(), ossCredentials: vi.fn(), completeUpload: vi.fn() },
}));
import { api } from '../src/services/api';
import { uploadFile } from '../src/features/media/upload';
import { uploadOSS } from '../src/services/oss';

const ticket: UploadTicket = {
  asset_id: 'asset-a',
  method: 'OSS_STS',
  upload_url: '/api/v1/storage/sts-token?asset_id=asset-a',
  object_key: 'ai-interview/user/person-a/incoming/asset-a.png',
  storage_backend: 'oss',
  headers: { 'Content-Type': 'image/png' },
  expires_in: 600,
};
const grant: OSSCredentials = {
  asset_id: ticket.asset_id,
  object_key: ticket.object_key!,
  prefix: 'ai-interview/user/person-a/incoming/',
  access_key_id: 'STS.test',
  access_key_secret: 'temporary-test-secret',
  security_token: 'temporary-test-token',
  expiration: '2099-01-01T00:00:00Z',
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  region: 'cn-hangzhou',
  bucket: 'test-bucket',
};
const input: UploadInput = {
  filename: 'avatar.png',
  content_type: 'image/png',
  size: 3,
  media_type: 'AVATAR',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.uploadTicket).mockResolvedValue(ticket);
  vi.mocked(api.ossCredentials).mockResolvedValue(grant);
  sdk.put.mockResolvedValue({ res: { headers: { etag: '"verified-etag"' } } });
});

it('uploads to the backend asset key and completes only after OSS succeeds', async () => {
  const file = new Blob(['png'], { type: 'image/png' });
  const progress = vi.fn();
  await uploadFile(file, input, progress);
  expect(sdk.put).toHaveBeenCalledWith(ticket.object_key, file, {
    mime: 'image/png',
    timeout: 600000,
  });
  expect(api.ossCredentials).toHaveBeenCalledWith(ticket.asset_id);
  expect(api.completeUpload).toHaveBeenCalledWith(ticket.asset_id, 'verified-etag');
  expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 100]);
  const options = sdk.create.mock.calls[0][0];
  expect(options.secure).toBe(true);
  expect(await options.refreshSTSToken()).toEqual({
    accessKeyId: grant.access_key_id,
    accessKeySecret: grant.access_key_secret,
    stsToken: grant.security_token,
  });
});

it('uses multipart upload for recordings and reports per-part progress', async () => {
  sdk.multipartUpload.mockImplementation(async (_key, _file, options) => {
    options.progress(0.5);
    return { res: { headers: { etag: '"multipart-etag"' } } };
  });
  const progress = vi.fn();
  await uploadOSS(ticket, new Blob([new Uint8Array(9 * 1024 * 1024)]), progress);
  expect(sdk.put).not.toHaveBeenCalled();
  expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 50, 100]);
});

it('rejects a credential for another asset before sending bytes', async () => {
  vi.mocked(api.ossCredentials).mockResolvedValue({
    ...grant,
    object_key: 'ai-interview/user/person-b/incoming/other.png',
  });
  await expect(uploadFile(new Blob(['png']), input, vi.fn())).rejects.toThrow('文件上传授权无效');
  expect(sdk.create).not.toHaveBeenCalled();
  expect(api.completeUpload).not.toHaveBeenCalled();
});

it('refreshes an expired grant for the same asset and never exposes SDK request details', async () => {
  sdk.put.mockRejectedValueOnce({ status: 403, message: 'signed-request-secret' });
  await uploadFile(new Blob(['png']), input, vi.fn());
  expect(api.uploadTicket).toHaveBeenCalledTimes(1);
  expect(api.ossCredentials).toHaveBeenCalledTimes(2);
  expect(api.completeUpload).toHaveBeenCalledTimes(1);
  sdk.put.mockRejectedValue({ status: 0, message: 'signed-request-secret' });
  await expect(uploadFile(new Blob(['png']), input, vi.fn())).rejects.toThrow('OSS 上传未完成');
  expect(api.completeUpload).toHaveBeenCalledTimes(1);
});
