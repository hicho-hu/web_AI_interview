import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../src/types/domain';

vi.mock('../src/services/api', () => ({ api: { job: vi.fn(), retryTask: vi.fn() } }));
import { api } from '../src/services/api';
import { readyJob } from '../src/features/jobs/prepare';

const job = (status: Job['status']): Job =>
  ({ id: 'job-1', status, task_id: 'task-1' }) as Job;

describe('岗位解析等待与恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('排队后继续使用同一个岗位，完成后停止轮询', async () => {
    vi.mocked(api.job).mockResolvedValueOnce(job('PREPARING')).mockResolvedValue(job('READY'));
    const result = readyJob('job-1');
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toMatchObject({ id: 'job-1', status: 'READY' });
    expect(api.job).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('已有失败任务原地重试一次，不新建岗位', async () => {
    vi.mocked(api.job).mockResolvedValueOnce(job('FAILED')).mockResolvedValue(job('READY'));
    vi.mocked(api.retryTask).mockResolvedValue({});
    const result = readyJob('job-1');
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toMatchObject({ status: 'READY' });
    expect(api.retryTask).toHaveBeenCalledOnce();
    expect(api.retryTask).toHaveBeenCalledWith('task-1', expect.any(AbortSignal));
  });

  it('持续排队到截止时间后结束等待，表单可以重试', async () => {
    vi.mocked(api.job).mockResolvedValue(job('PREPARING'));
    const result = readyJob('job-1', { timeoutMs: 3000, pollMs: 1000 });
    const rejected = expect(result).rejects.toThrow('已提交的岗位会保留');
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('截止时间会取消仍未返回的 HTTP 请求', async () => {
    vi.mocked(api.job).mockImplementation((_id, signal) =>
      new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')))),
    );
    const result = readyJob('job-1', { timeoutMs: 2000 });
    const rejected = expect(result).rejects.toThrow('岗位解析暂未完成');
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    expect(api.job).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
