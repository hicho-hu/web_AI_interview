import { describe, expect, it } from 'vitest';
import { filterJobFunctions } from '../src/features/jobs/functionCatalog';
import { generateJobDescription, mergeJobDescription } from '../src/features/jobs/description';

const role = (name: string) => filterJobFunctions().find((item) => item.name === name)!;
describe('岗位 JD 自动填充与聚合', () => {
  it('多岗位各自保留职责和专业要求，公共要求只出现一次', () => {
    const result = generateJobDescription([role('Python'), role('前端开发'), role('Python')]);
    expect(result).toContain('【Python】');
    expect(result).toContain('【前端开发】');
    expect(result).toContain('Python、常用 Web 框架');
    expect(result).toContain('HTML、CSS');
    expect(result.match(/团队协作/g)).toHaveLength(1);
    expect(result.match(/【Python】/g)).toHaveLength(1);
  });
  it('优先复用用户保存的完整 JD，多岗位合并每个岗位已有 JD', () => {
    const saved = [
      { job_title: 'Python', jd_text: '用户自己的 Python 职责与技术要求' },
      { job_title: '前端开发', jd_text: '用户自己的前端要求' },
    ];
    expect(generateJobDescription([role('Python')], saved)).toBe(saved[0].jd_text);
    const result = generateJobDescription([role('Python'), role('前端开发')], saved);
    saved.forEach((job) => expect(result).toContain(job.jd_text));
  });
  it('更换岗位时更新原有模板，保留手动补充和对模板的修改', () => {
    const previous = generateJobDescription([role('Python')]);
    const next = generateJobDescription([role('前端开发')]);
    expect(mergeJobDescription(previous, previous, next)).toBe(next);
    const edited =
      previous.replace(
        '• 熟悉 Python、常用 Web 框架、依赖管理及异步编程。',
        '• 熟悉 Python 及金融支付业务。',
      ) + '\n必须熟悉无障碍规范。';
    const result = mergeJobDescription(edited, previous, next);
    expect(result).toContain('HTML、CSS');
    expect(result).toContain('熟悉 Python 及金融支付业务。');
    expect(result).toContain('必须熟悉无障碍规范。');
    expect(result).not.toContain('【Python】');
    expect(mergeJobDescription(result, next, next)).toBe(result);
  });
  it('保留用户删除的公共条目，未选择岗位时不生成内容', () => {
    const previous = generateJobDescription([role('Python')]);
    const current = previous
      .split('\n')
      .filter((line) => !line.includes('团队协作'))
      .join('\n');
    expect(
      mergeJobDescription(current, previous, generateJobDescription([role('Python'), role('前端开发')])),
    ).not.toContain('团队协作');
    expect(generateJobDescription([])).toBe('');
  });
  it('非技术岗位使用对应专业内容，不混入开发语言', () => {
    expect(generateJobDescription([role('会计师')])).toContain('会计准则');
    const agriculture = generateJobDescription([role('农业技术员')]);
    expect(agriculture).toContain('农业技术员');
    expect(agriculture).not.toContain('Python');
    expect(agriculture).not.toContain('后端服务');
  });
});
