import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorState } from '../src/components/common/ui';
import { appendPracticeTranscript, MAX_PRACTICE_ANSWER_LENGTH } from '../src/features/questions/answer';

describe('真题语音输入与错误提示', () => {
  it('语音转写追加到现有草稿，不替换内容或插入多余换行', () => {
    expect(appendPracticeTranscript('我的初步方案', ' 补充故障处理。 ')).toBe('我的初步方案\n补充故障处理。');
    expect(appendPracticeTranscript('已有回答\n', '补充')).toBe('已有回答\n补充');
    expect(appendPracticeTranscript('', '语音回答')).toBe('语音回答');
    expect(appendPracticeTranscript('保留草稿', '  ')).toBe('保留草稿');
  });
  it('允许100000字符，超长追加明确提示且不截断原文', () => {
    expect(appendPracticeTranscript('答'.repeat(99998), '补')).toHaveLength(MAX_PRACTICE_ANSWER_LENGTH);
    expect(() => appendPracticeTranscript('答'.repeat(100000), '补充回答')).toThrow('转写内容已保留');
  });
  it('没有错误时不显示加载失败，真实错误仍正常展示', () => {
    for (const error of [null, undefined, false]) expect(renderToStaticMarkup(createElement(ErrorState, { error }))).toBe('');
    const html = renderToStaticMarkup(createElement(ErrorState, { error: new Error('后端连接失败') }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('后端连接失败');
  });
});
