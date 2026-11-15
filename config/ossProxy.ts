import type { ProxyOptions } from 'vite';

// The upstream is deployment configuration, never supplied by a browser request.
export const ossUploadPath =
  '^/ai-interview/user/[A-Za-z0-9-]+/incoming/[A-Za-z0-9-]+\\.[A-Za-z0-9]+(?:\\?|$)';

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
