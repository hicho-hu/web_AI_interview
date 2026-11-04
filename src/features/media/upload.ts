import type { UploadInput, UploadTicket } from '../../types/domain';
import { api } from '../../services/api';
import { ApiError } from '../../services/client';
import { uploadOSS } from '../../services/oss';

export function signedUrl(url: string) {
  // Only rewrite the backend's local object path; S3/COS URLs remain untouched.
  const parsed = new URL(url, window.location.origin);
  const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1', window.location.origin);
  if (
    parsed.pathname.startsWith('/api/v1/local-objects/') &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname)
  ) {
    return new URL(`${parsed.pathname}${parsed.search}`, base.origin).href;
  }
  return parsed.href;
}
function put(ticket: UploadTicket, file: Blob, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, signedUrl(ticket.upload_url));
    xhr.timeout = 600000;
    Object.entries(ticket.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError('文件上传失败，请重试', 'UPLOAD_FAILED', undefined, xhr.status));
    xhr.onerror = () => reject(new Error('上传连接中断，请检查网络后重试'));
    xhr.ontimeout = () => reject(new Error('上传超时，录制内容仍然保留，请重试'));
    xhr.send(file);
  });
}
export async function uploadFile(file: Blob, input: UploadInput, onProgress: (value: number) => void) {
  let ticket = await api.uploadTicket(input);
  const transfer = () =>
    ticket.method === 'OSS_STS' ? uploadOSS(ticket, file, onProgress) : put(ticket, file, onProgress);
  let etag: string | void;
  try {
    etag = await transfer();
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 410].includes(error.status || 0)) {
      if (ticket.method !== 'OSS_STS') ticket = await api.uploadTicket(input);
      etag = await transfer();
    } else throw error;
  }
  await api.completeUpload(ticket.asset_id, etag || undefined);
  return ticket;
}
