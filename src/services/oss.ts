import type { OSSCredentials, UploadTicket } from '../types/domain';
import { api } from './api';
import { ApiError } from './client';

function checkGrant(grant: OSSCredentials, ticket: UploadTicket) {
  if (
    grant.asset_id !== ticket.asset_id ||
    grant.object_key !== ticket.object_key ||
    !grant.object_key.startsWith(grant.prefix) ||
    !grant.prefix.startsWith('ai-interview/user/') ||
    !grant.endpoint.startsWith('https://') ||
    !grant.access_key_id ||
    !grant.access_key_secret ||
    !grant.security_token ||
    !(Date.parse(grant.expiration) > Date.now())
  )
    throw new ApiError('文件上传授权无效，请重新申请', 'UPLOAD_GRANT_INVALID');
}

export async function uploadOSS(
  ticket: UploadTicket,
  file: Blob,
  onProgress: (value: number) => void,
): Promise<string | undefined> {
  const grant = await api.ossCredentials(ticket.asset_id);
  checkGrant(grant, ticket);
  // Keep the object path intact: it is part of the OSS signature. The Web server
  // forwards this namespace to its fixed bucket, retaining the scoped STS auth.
  const proxied = import.meta.env.VITE_OSS_UPLOAD_MODE !== 'direct';
  const endpoint = proxied ? window.location.origin : grant.endpoint;
  const { default: OSS } = await import('ali-oss');
  const client = new OSS({
    region: `oss-${grant.region}`,
    endpoint,
    cname: proxied,
    bucket: grant.bucket,
    accessKeyId: grant.access_key_id,
    accessKeySecret: grant.access_key_secret,
    stsToken: grant.security_token,
    secure: new URL(endpoint).protocol === 'https:',
    timeout: 600000,
    refreshSTSTokenInterval: 300000,
    refreshSTSToken: async () => {
      const next = await api.ossCredentials(ticket.asset_id);
      checkGrant(next, ticket);
      return {
        accessKeyId: next.access_key_id,
        accessKeySecret: next.access_key_secret,
        stsToken: next.security_token,
      };
    },
  });
  onProgress(0);
  try {
    const options = { mime: ticket.headers['Content-Type'] || file.type, timeout: 600000 };
    const result =
      file.size >= 8 * 1024 * 1024
        ? await client.multipartUpload(grant.object_key, file, {
            ...options,
            partSize: 4 * 1024 * 1024,
            parallel: 3,
            progress: (fraction: number) => onProgress(Math.min(99, Math.round(fraction * 100))),
          })
        : await client.put(grant.object_key, file, options);
    onProgress(100);
    return (result.res.headers as Record<string, string>).etag?.replaceAll('"', '');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = (error as { status?: number }).status;
    // SDK errors may contain request signatures. Expose only our own messages and status.
    const missingProxy = proxied && (status === 404 || status === 405);
    throw new ApiError(
      missingProxy
        ? '文件上传服务未配置，请联系管理员'
        : status === 403
          ? '文件上传授权失效或权限不足，请重试；持续失败请联系管理员'
          : proxied
            ? '文件上传未完成，请检查网络后重试'
            : 'OSS 上传未完成，请检查网络；管理员需确认存储跨域设置',
      missingProxy ? 'UPLOAD_PROXY_UNAVAILABLE' : 'UPLOAD_FAILED',
      undefined,
      status,
    );
  }
}
