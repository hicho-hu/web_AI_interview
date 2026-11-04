import { test, expect } from '@playwright/test';

for (const multipart of [false, true]) {
  test(`浏览器 OSS SDK：${multipart ? '分片' : '小文件'}上传、ETag 确认与进度`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const objectKey = 'ai-interview/user/browser-fixture/incoming/asset-a.png';
    const size = multipart ? 9 * 1024 * 1024 : 3;
    let uploaded = 0;
    let completed = false;
    let partCount = 0;
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let data: unknown;
      if (url.pathname === '/api/v1/media/upload-url') {
        expect(request.postDataJSON().size).toBe(size);
        data = {
          asset_id: 'asset-a',
          method: 'OSS_STS',
          upload_url: '/api/v1/storage/sts-token?asset_id=asset-a',
          object_key: objectKey,
          storage_backend: 'oss',
          headers: { 'Content-Type': 'image/png' },
          expires_in: 600,
        };
      } else if (url.pathname === '/api/v1/storage/sts-token') {
        expect(url.searchParams.get('asset_id')).toBe('asset-a');
        data = {
          asset_id: 'asset-a',
          object_key: objectKey,
          prefix: 'ai-interview/user/browser-fixture/incoming/',
          access_key_id: 'STS.synthetic-browser-test',
          access_key_secret: 'synthetic-browser-secret',
          security_token: 'synthetic-browser-token',
          expiration: '2099-01-01T00:00:00Z',
          endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
          region: 'cn-hangzhou',
          bucket: 'oss-browser-test',
        };
      } else if (url.pathname === '/api/v1/media/asset-a/complete') {
        expect(uploaded).toBe(size);
        expect(request.postDataJSON()).toEqual({ etag: 'browser-verified-etag' });
        completed = true;
        data = { status: 'READY' };
      } else throw new Error(`Unexpected API request: ${url.pathname}`);
      await route.fulfill({ json: { code: 'OK', message: 'success', data, request_id: 'oss-test' } });
    });
    await page.route('https://oss-browser-test.oss-cn-hangzhou.aliyuncs.com/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      expect(url.pathname).toBe(`/${objectKey}`);
      const headers = {
        'access-control-allow-origin': new URL(page.url()).origin,
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,HEAD,PUT,POST,DELETE',
        'access-control-expose-headers': 'ETag,x-oss-request-id',
        etag: '"browser-verified-etag"',
        'x-oss-request-id': 'synthetic-request-id',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 200, headers });
        return;
      }
      expect(request.headers()['x-oss-security-token']).toBe('synthetic-browser-token');
      expect(request.headers().authorization).toMatch(/^OSS /);
      let body = '';
      if (request.method() === 'PUT') {
        uploaded += request.postDataBuffer()!.length;
        partCount++;
      } else if (url.searchParams.has('uploads')) {
        body = `<InitiateMultipartUploadResult><Bucket>oss-browser-test</Bucket><Key>${objectKey}</Key><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>`;
      } else if (url.searchParams.has('uploadId')) {
        body = `<CompleteMultipartUploadResult><Location>https://oss-browser-test.oss-cn-hangzhou.aliyuncs.com/${objectKey}</Location><Bucket>oss-browser-test</Bucket><Key>${objectKey}</Key><ETag>"browser-verified-etag"</ETag></CompleteMultipartUploadResult>`;
      }
      await route.fulfill({ status: 200, headers, contentType: 'application/xml', body });
    });
    await page.goto('/login');
    const progress = await page.evaluate(async (size) => {
      const modulePath = '/src/features/media/upload.ts';
      const { uploadFile } = await import(modulePath);
      const values: number[] = [];
      await uploadFile(
        new Blob([new Uint8Array(size)], { type: 'image/png' }),
        { filename: 'sample.png', content_type: 'image/png', size, media_type: 'AVATAR' },
        (value: number) => values.push(value),
      );
      return values;
    }, size);
    expect(completed).toBe(true);
    expect(partCount).toBe(multipart ? 3 : 1);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(100);
    if (multipart) expect(progress.some((value) => value > 0 && value < 100)).toBe(true);
    expect(errors).toEqual([]);
  });
}
