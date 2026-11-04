export interface CaptionCue {
  id: string;
  speaker: 'interviewer' | 'candidate';
  text: string;
  startMs: number;
  endMs: number;
  final: boolean;
}
const timestamp = (ms: number) => {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3600000)).padStart(2, '0')}:${String(Math.floor(value / 60000) % 60).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
};
export function captionsVtt(cues: CaptionCue[]) {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ');
  return new Blob(
    [
      'WEBVTT\n\n' +
        cues
          .filter((cue) => cue.text.trim())
          .map(
            (cue, i) =>
              `${i + 1}\n${timestamp(cue.startMs)} --> ${timestamp(Math.max(cue.startMs + 250, cue.endMs))}\n${cue.speaker === 'interviewer' ? '面试官' : '我'}：${escape(cue.text)}\n`,
          )
          .join('\n'),
    ],
    { type: 'text/vtt' },
  );
}
export function parseCaptionsVtt(text: string): CaptionCue[] {
  const ms = (time: string) => {
    const [h, m, s] = time.split(':').map(Number);
    return (h * 3600 + m * 60 + s) * 1000;
  };
  return text
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .flatMap((block, index) => {
      const lines = block.split('\n'),
        timing = lines.findIndex((line) => line.includes(' --> '));
      if (timing < 0) return [];
      const [start, end] = lines[timing].split(' --> '),
        content = lines
          .slice(timing + 1)
          .join(' ')
          .trim();
      const startMs = ms(start),
        endMs = ms(end);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
      const speaker = content.startsWith('面试官：') ? 'interviewer' : 'candidate';
      return [
        {
          id: `vtt-${index}`,
          speaker,
          startMs,
          endMs,
          final: true,
          text: content
            .replace(/^(面试官|我)：/, '')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&'),
        } as CaptionCue,
      ];
    });
}
