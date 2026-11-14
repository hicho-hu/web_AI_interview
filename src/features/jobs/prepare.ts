import { api } from '../../services/api';

const timeoutMessage = '岗位解析暂未完成，请稍后点击重试；已提交的岗位会保留。';

export async function readyJob(
  id: string,
  options: { timeoutMs?: number; pollMs?: number; onProgress?: (message: string) => void } = {},
) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  let retried = false;
  const wait = () =>
    new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error(timeoutMessage));
      };
      const timer = setTimeout(() => {
        controller.signal.removeEventListener('abort', abort);
        resolve();
      }, options.pollMs ?? 1500);
      if (controller.signal.aborted) abort();
      else controller.signal.addEventListener('abort', abort, { once: true });
    });
  try {
    while (!controller.signal.aborted) {
      const job = await api.job(id, controller.signal);
      if (job.status === 'READY') return job;
      if (job.status === 'FAILED') {
        if (retried || !job.task_id) throw new Error('岗位解析失败，请重试或调整岗位描述。');
        retried = true;
        options.onProgress?.('正在重试岗位解析');
        await api.retryTask(job.task_id, controller.signal);
      } else options.onProgress?.('正在解析岗位，提取重点能力');
      await wait();
    }
    throw new Error(timeoutMessage);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}
