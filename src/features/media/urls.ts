import { ossAcceptedObjectPath, ossAudioObjectPath, ossResumeObjectPath } from '../../../config/ossPaths';

const audioPath = new RegExp(`^${ossAudioObjectPath}$`);
const resumePath = new RegExp(`^${ossResumeObjectPath}$`);
const acceptedPath = new RegExp(`^${ossAcceptedObjectPath}$`);

export function signedUrl(url: string) {
  const parsed = new URL(url, window.location.origin);
  const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1', window.location.origin);
  if (
    parsed.pathname.startsWith('/api/v1/local-objects/') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  )
    return new URL(`${parsed.pathname}${parsed.search}`, base.origin).href;

  const defaultHost = 'ai-interview-storage.oss-cn-hangzhou.aliyuncs.com';
  const mediaHost = import.meta.env.VITE_OSS_MEDIA_HOST || import.meta.env.VITE_OSS_AUDIO_HOST || defaultHost;
  const audioHost = import.meta.env.VITE_OSS_AUDIO_HOST || mediaHost;
  const isResume = resumePath.test(parsed.pathname);
  const acceptedHost = isResume ? import.meta.env.VITE_OSS_RESUME_HOST || mediaHost : mediaHost;
  const acceptedMode = isResume
    ? import.meta.env.VITE_OSS_RESUME_MODE || import.meta.env.VITE_OSS_MEDIA_MODE
    : import.meta.env.VITE_OSS_MEDIA_MODE;
  const proxyAudio =
    import.meta.env.VITE_OSS_AUDIO_MODE !== 'direct' &&
    parsed.origin === `https://${audioHost}` &&
    audioPath.test(parsed.pathname);
  const proxyAccepted =
    acceptedMode !== 'direct' &&
    parsed.origin === `https://${acceptedHost}` &&
    acceptedPath.test(parsed.pathname);
  // Preserve the encoded query verbatim: it is part of the backend's signature.
  if (!parsed.username && !parsed.password && (proxyAudio || proxyAccepted))
    return new URL(`${parsed.pathname}${parsed.search}`, window.location.origin).href;
  return parsed.href;
}
