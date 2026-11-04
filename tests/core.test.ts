import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, configSchema, jobSchema } from '../src/features/interviews/schema';
import { remainingSeconds } from '../src/utils/interview';
import { mock } from '../src/services/mock';
import { completeOperation, operationKey } from '../src/services/client';
const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});
beforeEach(() => values.clear());
describe('输入与幂等边界', () => {
  it('拒绝空白岗位、超过限制的题数', () => {
    expect(jobSchema.safeParse({ job_title: '  ', jd_text: 'React', seniority: 'MIDDLE' }).success).toBe(
      false,
    );
    expect(configSchema.safeParse({ ...defaultConfig, question_count: 21 }).success).toBe(false);
  });
  it('同一失败操作保留幂等键，成功后新操作换键', () => {
    const key = operationKey('submit-test');
    expect(operationKey('submit-test')).toBe(key);
    completeOperation('submit-test');
    expect(operationKey('submit-test')).not.toBe(key);
  });
});
describe('文字面试演示闭环', () => {
  it('岗位定制提问、动态追问、拒绝重复提交、刷新恢复、报告不虚构评分', () => {
    const job = mock.createJob({
      job_title: '前端工程师',
      jd_text: 'React 组件设计；性能优化',
      seniority: 'MIDDLE',
    });
    const { interview_id: id } = mock.create({
      job_profile_id: job.id,
      config: { ...defaultConfig, question_count: 1 },
    });
    expect(mock.detail(id).current_question?.question).toContain('React 组件设计');
    mock.action(id, 'start');
    const turn = mock.detail(id).current_question!;
    mock.submit(id, turn.id, '我负责过组件开发。');
    expect(mock.detail(id).current_question?.turn_type).toBe('FOLLOW_UP');
    expect(() => mock.submit(id, turn.id, '再次提交')).toThrow('已经提交');
    const next = mock.detail(id).current_question!;
    mock.submit(id, next.id, '我拆分了复用组件，补充文档，并通过项目构建和团队复核验证。');
    expect(mock.detail(id).status).toBe('COMPLETED');
    expect(mock.turns(id).items).toHaveLength(2);
    const report = mock.report(id).report!;
    expect(report.overall_score).toBeNull();
    expect(report.reviews[0].evidence[0]).toBe('我负责过组件开发。');
    expect(report.is_mock).toBe(true);
  });
  it('暂停时倒计时冻结，继续时不小于零', () => {
    vi.useFakeTimers();
    const job = mock.createJob({ job_title: '工程师', jd_text: '开发', seniority: 'MIDDLE' });
    const { interview_id: id } = mock.create({ job_profile_id: job.id, config: defaultConfig });
    mock.action(id, 'start');
    vi.advanceTimersByTime(10000);
    expect(mock.detail(id).elapsed_seconds).toBe(10);
    mock.action(id, 'pause');
    vi.advanceTimersByTime(5000);
    expect(mock.detail(id).elapsed_seconds).toBe(10);
    expect(remainingSeconds({ ...mock.detail(id), elapsed_seconds: 20 }, 0, 100000)).toBe(880);
    expect(
      remainingSeconds({ ...mock.detail(id), status: 'IN_PROGRESS', elapsed_seconds: 950 }, 0, 1000),
    ).toBe(0);
    mock.action(id, 'resume');
    vi.advanceTimersByTime(3000);
    expect(mock.detail(id).elapsed_seconds).toBe(13);
    vi.useRealTimers();
  });
});
