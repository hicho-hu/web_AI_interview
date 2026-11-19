export const MAX_PRACTICE_ANSWER_LENGTH = 100000;

export function appendPracticeTranscript(current: string, transcript: string): string {
  const addition = transcript.trim();
  if (!addition) return current;
  const combined = `${current}${current && !current.endsWith('\n') ? '\n' : ''}${addition}`;
  if (combined.length > MAX_PRACTICE_ANSWER_LENGTH) throw new Error('追加后将超过 100000 字符，请先精简回答。转写内容已保留。');
  return combined;
}
