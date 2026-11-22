// Local production-test upstream. Serves only synthetic files created by tests.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const types = { 'session.wav': 'audio/wav', 'session.webm': 'video/webm', 'session.vtt': 'text/vtt' };
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:5198');
  if (url.pathname === '/health') return response.end('ok');
  const name = url.pathname.match(
    /^\/ai-interview\/user\/10000003\/accepted\/(session\.(?:wav|webm|vtt))$/,
  )?.[1];
  response.setHeader('Cache-Control', 'no-store');
  if (!name || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404);
    return response.end();
  }
  if (
    !/^grant-\d+$/.test(url.searchParams.get('x-oss-signature') || '') ||
    (name === 'session.wav' && url.searchParams.get('x-oss-signature') === 'grant-1')
  ) {
    response.writeHead(403, { 'Content-Type': 'application/xml' });
    return response.end('<Error><Code>AccessDenied</Code></Error>');
  }
  try {
    const bytes = readFileSync(join(process.cwd(), 'test-results/production-objects', name));
    response.setHeader('Content-Type', types[name]);
    response.setHeader('Accept-Ranges', 'bytes');
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]),
        end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
      if (start > end) {
        response.writeHead(416);
        return response.end();
      }
      response.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': end - start + 1,
      });
      response.end(bytes.subarray(start, end + 1));
    } else {
      response.setHeader('Content-Length', bytes.length);
      response.end(bytes);
    }
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(5198, '127.0.0.1');
