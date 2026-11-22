import { createServer as createHTTPServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { ossAudioProxy, ossMediaProxy, ossUploadProxy } from '../config/ossProxy';

const pdf = Buffer.from('%PDF-1.7\nSynthetic resume\x00\xff\n%%EOF');
const docx = Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 128]);

const received: { url: string; method: string; headers: IncomingHttpHeaders; body: Buffer }[] = [];
const upstream = createHTTPServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  received.push({
    url: request.url!,
    method: request.method!,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
  response.setHeader('ETag', '"upstream-etag"');
  response.setHeader('x-oss-request-id', 'synthetic-request-id');
  if (request.url!.includes('uploadId=expired')) {
    response.writeHead(403, { 'Content-Type': 'application/xml' });
    response.end('<Error><Code>AccessDenied</Code></Error>');
  } else if (request.url!.startsWith('/ai-interview/user/test-owner/accepted/')) {
    const word = request.url!.split('?')[0].endsWith('.docx');
    const bytes = word ? docx : pdf;
    response.setHeader(
      'Content-Type',
      word ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
    );
    if (request.headers.range === 'bytes=0-4') {
      response.writeHead(206, { 'Content-Range': `bytes 0-4/${bytes.length}` });
      response.end(bytes.subarray(0, 5));
    } else {
      response.setHeader('Content-Length', bytes.length);
      response.end(bytes);
    }
  } else response.end('ok');
});
let vite: ViteDevServer;
let origin: string;
let upstreamHost: string;
const key = '/ai-interview/user/test-owner/incoming/asset-a.pdf';
const audioKey = '/ai-interview/user/test-owner/generated/question-a.wav';
const resumeKey = '/ai-interview/user/test-owner/accepted/resume-a.pdf';

beforeAll(async () => {
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamHost = `127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  vite = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      cors: false,
      proxy: {
        ...ossUploadProxy(`http://${upstreamHost}`),
        ...ossAudioProxy(`http://${upstreamHost}`),
        ...ossMediaProxy(`http://${upstreamHost}`),
      },
    },
  });
  await vite.listen();
  origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
});
beforeEach(() => received.splice(0));
afterAll(async () => {
  await vite?.close();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

it('forwards bytes, signed headers and multipart query unchanged without Origin or site cookies', async () => {
  const body = Buffer.from([0, 1, 255, 254, 127]);
  const query = '?uploadId=part%2Bupload%2Fid&partNumber=2';
  const response = await fetch(`${origin}${key}${query}`, {
    method: 'PUT',
    body,
    headers: {
      Authorization: 'OSS STS.synthetic:signature',
      'x-oss-security-token': 'synthetic-sts-token',
      'x-oss-date': 'Sat, 14 Nov 2026 00:00:00 GMT',
      'Content-Type': 'application/pdf',
      'Content-MD5': 'synthetic-md5',
      Origin: origin,
      Cookie: 'session=must-not-reach-oss',
    },
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('ok');
  expect(response.headers.get('etag')).toBe('"upstream-etag"');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(received).toHaveLength(1);
  expect(received[0].url).toBe(key + query);
  expect(received[0].method).toBe('PUT');
  expect(received[0].body).toEqual(body);
  expect(received[0].headers).toMatchObject({
    host: upstreamHost,
    authorization: 'OSS STS.synthetic:signature',
    'x-oss-security-token': 'synthetic-sts-token',
    'x-oss-date': 'Sat, 14 Nov 2026 00:00:00 GMT',
    'content-type': 'application/pdf',
    'content-md5': 'synthetic-md5',
  });
  expect(received[0].headers.origin).toBeUndefined();
  expect(received[0].headers.cookie).toBeUndefined();
});

it('passes multipart POST XML and OSS error statuses through the proxy', async () => {
  const body = '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber></Part></CompleteMultipartUpload>';
  const response = await fetch(`${origin}${key}?uploadId=expired`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/xml' },
  });
  expect(response.status).toBe(403);
  expect(await response.text()).toBe('<Error><Code>AccessDenied</Code></Error>');
  expect(received[0].body.toString()).toBe(body);
});

it('does not forward writes to accepted objects or arbitrary paths to OSS', async () => {
  for (const path of [key.replace('/incoming/', '/accepted/'), '/ai-interview/other', '/other-bucket/file']) {
    const response = await fetch(origin + path, { method: 'PUT', body: 'test' });
    await response.text();
  }
  expect(received).toEqual([]);
});

it('reads signed AI audio without CORS and preserves the raw signature query and range', async () => {
  const query =
    '?x-oss-security-token=token%2Bpart%2Fvalue%3D&x-oss-signature=abc123&x-oss-date=20261119T153434Z';
  const response = await fetch(origin + audioKey + query, {
    headers: {
      Origin: origin,
      Cookie: 'session=must-not-reach-oss',
      Authorization: 'Bearer site-token',
      Range: 'bytes=0-11',
    },
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('ok');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(received).toHaveLength(1);
  expect(received[0].url).toBe(audioKey + query);
  expect(received[0].headers.host).toBe(upstreamHost);
  expect(received[0].headers.range).toBe('bytes=0-11');
  for (const header of ['origin', 'cookie', 'authorization'])
    expect(received[0].headers[header]).toBeUndefined();
});

it('supports audio HEAD and preserves OSS signature failures', async () => {
  const head = await fetch(origin + audioKey + '?x-oss-signature=synthetic', { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  expect(received[0].method).toBe('HEAD');
  const expired = await fetch(origin + audioKey + '?uploadId=expired');
  expect(expired.status).toBe(403);
  expect(await expired.text()).toBe('<Error><Code>AccessDenied</Code></Error>');
});

it('rejects generated audio writes and paths outside the audio namespace before reaching OSS', async () => {
  for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
    const response = await fetch(origin + audioKey, { method });
    expect(response.status).toBe(404);
    await response.text();
  }
  for (const path of [
    audioKey.replace('.wav', '.pdf'),
    audioKey.replace('.wav', '.html'),
    audioKey.replace('question-a.wav', 'nested/question-a.wav'),
  ]) {
    const response = await fetch(origin + path);
    await response.text();
  }
  expect(received).toEqual([]);
});

it('preserves signed PDF/DOCX bytes, content types and queries without site credentials or CORS', async () => {
  const query = '?x-oss-security-token=token%2Bpart%2Fvalue%3D&x-oss-signature=synthetic';
  for (const extension of ['pdf', 'docx']) {
    const path = resumeKey.replace('.pdf', `.${extension}`);
    const response = await fetch(origin + path + query, {
      headers: { Origin: origin, Cookie: 'site-session=synthetic', Authorization: 'Bearer site-token' },
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(extension === 'pdf' ? pdf : docx);
    expect(response.headers.get('content-type')).toBe(
      extension === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const request = received.at(-1)!;
    expect(request.url).toBe(path + query);
    expect(request.headers.host).toBe(upstreamHost);
    for (const header of ['origin', 'cookie', 'authorization'])
      expect(request.headers[header]).toBeUndefined();
  }
});

it('supports resume HEAD and byte ranges while preserving OSS authorization errors', async () => {
  const head = await fetch(origin + resumeKey, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe(String(pdf.length));
  expect(await head.text()).toBe('');
  const partial = await fetch(origin + resumeKey, { headers: { Range: 'bytes=0-4' } });
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe(`bytes 0-4/${pdf.length}`);
  expect(await partial.text()).toBe('%PDF-');
  const expired = await fetch(origin + resumeKey + '?uploadId=expired');
  expect(expired.status).toBe(403);
  expect(await expired.text()).toBe('<Error><Code>AccessDenied</Code></Error>');
});

it('rejects writes and unsafe paths outside the accepted resume namespace', async () => {
  for (const method of ['PUT', 'POST', 'PATCH', 'DELETE']) {
    const response = await fetch(origin + resumeKey, { method });
    expect(response.status).toBe(404);
    await response.text();
  }
  for (const path of [
    resumeKey.replace('.pdf', '.html'),
    resumeKey.replace('.pdf', '.svg'),
    resumeKey.replace('resume-a.pdf', 'nested/resume-a.pdf'),
  ]) {
    await (await fetch(origin + path)).text();
  }
  expect(received).toEqual([]);
});
