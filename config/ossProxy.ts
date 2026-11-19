import type { ProxyOptions } from 'vite';

// The upstream is deployment configuration, never supplied by a browser request.
export const ossUploadPath =
  '^/ai-interview/user/[A-Za-z0-9-]+/incoming/[A-Za-z0-9-]+\\.[A-Za-z0-9]+(?:\\?|$)';
export const ossAudioPath =
  '^/ai-interview/user/[A-Za-z0-9-]+/generated/[A-Za-z0-9-]+\\.(?:wav|mp3)(?:\\?|$)';

export function ossAudioProxy(target: string): Record<string, ProxyOptions> {
  return {
    [ossAudioPath]: {
      target,
      changeOrigin: true,
      timeout: 90000,
      proxyTimeout: 90000,
      bypass(request) {
        // Vite returns 404 for rejected methods without contacting OSS.
        if (request.method !== 'GET' && request.method !== 'HEAD') return false;
      },
      configure(proxy) {
        proxy.on('proxyReq', (request) => {
          request.removeHeader('origin');
          request.removeHeader('cookie');
          // Downloads are authorized by the backend's signed query, never a site token.
          request.removeHeader('authorization');
        });
        proxy.on('proxyRes', (response) => {
          response.headers['cache-control'] = 'no-store';
        });
      },
    },
  };
}

export function ossUploadProxy(target: string): Record<string, ProxyOptions> {
  return {
    [ossUploadPath]: {
      target,
      changeOrigin: true,
      timeout: 600000,
      proxyTimeout: 600000,
      configure(proxy) {
        proxy.on('proxyReq', (request) => {
          request.removeHeader('origin');
          request.removeHeader('cookie');
        });
        proxy.on('proxyRes', (response) => {
          response.headers['cache-control'] = 'no-store';
        });
      },
    },
  };
}
