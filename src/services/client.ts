import axios from 'axios';
import { z } from 'zod';
import { useSession } from '../stores/session';

const envelope = z.object({
  code: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
  request_id: z.string(),
});
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId?: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1', timeout: 25000 });
client.interceptors.request.use((config) => {
  const token = useSession.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});
export async function request<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
  try {
    const response = await client.request({
      method,
      url: path,
      data: body,
      headers: key ? { 'Idempotency-Key': key } : undefined,
    });
    const parsed = envelope.safeParse(response.data);
    if (!parsed.success) throw new ApiError('服务响应格式不正确，请稍后重试', 'INVALID_RESPONSE');
    if (parsed.data.code !== 'OK')
      throw new ApiError(parsed.data.message, parsed.data.code, parsed.data.request_id);
    return parsed.data.data as T;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data;
      if (
        error.response?.status === 401 &&
        (!data?.code || data.code === 'AUTH_UNAUTHORIZED') &&
        !path.includes('/auth/') &&
        error.config?.headers?.Authorization === `Bearer ${useSession.getState().token}`
      ) {
        useSession.getState().clear();
        window.dispatchEvent(new Event('session-expired'));
      }
      throw new ApiError(
        data?.message ||
          (error.code === 'ECONNABORTED'
            ? '请求超时，请重试。已提交的操作会由幂等保护。'
            : '无法连接服务，请检查网络和后端运行状态'),
        data?.code || 'NETWORK_ERROR',
        data?.request_id,
        error.response?.status,
      );
    }
    throw error;
  }
}

// Keep keys in memory for the life of an operation. Failed requests reuse the same key.
const keys = new Map<string, string>();
export function operationKey(scope: string) {
  if (!keys.has(scope)) keys.set(scope, crypto.randomUUID());
  return keys.get(scope)!;
}
export function completeOperation(scope: string) {
  keys.delete(scope);
}
