import type { ProxyOptions } from 'vite';
import {
  ossAcceptedObjectPath,
  ossAudioObjectPath,
  ossIncomingObjectPath,
  ossResumeObjectPath,
} from './ossPaths';

// The upstream is deployment configuration, never supplied by a browser request.
export const ossUploadPath = `^${ossIncomingObjectPath}(?:\\?|$)`;
export const ossAudioPath = `^${ossAudioObjectPath}(?:\\?|$)`;
export const ossResumePath = `^${ossResumeObjectPath}(?:\\?|$)`;
export const ossMediaPath = `^${ossAcceptedObjectPath}(?:\\?|$)`;

function ossReadProxy(path: string, target: string): Record<string, ProxyOptions> {
  return {
    [path]: {
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

export function ossAudioProxy(target: string): Record<string, ProxyOptions> {
  return ossReadProxy(ossAudioPath, target);
}

export function ossResumeProxy(target: string): Record<string, ProxyOptions> {
  return ossReadProxy(ossResumePath, target);
}

export function ossMediaProxy(target: string): Record<string, ProxyOptions> {
  return ossReadProxy(ossMediaPath, target);
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
