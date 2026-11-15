import { describe, expect, it } from 'vitest';
import { filterJobFunctions, jobFunctionGroups } from '../src/features/jobs/functionCatalog';

describe('51job 工作职能目录', () => {
  it('保留参考目录全部层级、岗位编码和常见招聘岗位', () => {
    expect(jobFunctionGroups).toHaveLength(26);
    expect(jobFunctionGroups.flatMap((group) => group.children)).toHaveLength(130);
    const jobs = filterJobFunctions();
    expect(jobs).toHaveLength(1058);
    expect(jobs.map((job) => job.name)).toEqual(
      expect.arrayContaining([
        'Python',
        '前端开发',
        '大模型应用工程师',
        'AI产品经理',
        '会计师',
        '农业技术员',
      ]),
    );
    expect(jobs.every((job) => job.code && job.name && job.categoryName && job.subcategoryName)).toBe(true);
  });

  it('逐级筛选时保留同一岗位在不同职能下的归属，全局结果不重复', () => {
    const support = filterJobFunctions({ categoryCode: '9F02', subcategoryCode: '7900' });
    const management = filterJobFunctions({ categoryCode: '9F02', subcategoryCode: '2600' });
    for (const branch of [support, management]) {
      expect(branch.find((item) => item.code === 'A0LB')?.name).toBe('网络工程师');
    }
    const all = filterJobFunctions();
    expect(all.filter((item) => item.code === 'A0LB')).toHaveLength(1);
    expect(new Set(all.map((item) => item.code)).size).toBe(all.length);
    expect(filterJobFunctions({ categoryCode: '9F04', subcategoryCode: '0100' })).toEqual([]);
  });

  it('搜索支持大小写、细分职能与最后一类岗位，无结果时返回空列表', () => {
    expect(filterJobFunctions({ search: '  pYtHoN ' }).map((item) => item.name)).toEqual(['Python']);
    expect(filterJobFunctions({ search: '前端/移动开发' }).map((item) => item.name)).toContain('鸿蒙开发');
    expect(filterJobFunctions({ categoryCode: '9F25', search: '农业' }).map((item) => item.name)).toContain(
      '农业技术员',
    );
    expect(filterJobFunctions({ search: '不存在的岗位名称12345' })).toEqual([]);
  });
});
