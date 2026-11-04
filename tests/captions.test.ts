import { expect, it } from 'vitest';
import { captionsVtt, parseCaptionsVtt } from '../src/features/media/captions';

it('字幕包含角色、正确时间和转义文本，回放时可还原', async () => {
  const cues = [
    {
      id: 'q',
      speaker: 'interviewer' as const,
      text: '介绍 <React> & 项目',
      startMs: 1234,
      endMs: 3456,
      final: true,
    },
    {
      id: 'a',
      speaker: 'candidate' as const,
      text: '我负责组件开发。',
      startMs: 3500,
      endMs: 7100,
      final: true,
    },
  ];
  const text = await captionsVtt(cues).text();
  expect(text).toContain('00:00:01.234 --> 00:00:03.456');
  expect(text).toContain('&lt;React&gt; &amp;');
  const parsed = parseCaptionsVtt(text);
  expect(parsed).toHaveLength(2);
  expect(parsed[0]).toMatchObject({ speaker: 'interviewer', startMs: 1234, text: cues[0].text });
  expect(parsed[1]).toMatchObject({ speaker: 'candidate', endMs: 7100, text: cues[1].text });
});
