import type { Interview, InterviewStatus, Mode } from '../types/domain';
export const modeLabels: Record<Mode, string> = { TEXT: '文字面试', VOICE: '语音面试', VIDEO: '视频面试' };
export const statusLabels: Record<InterviewStatus, string> = {
  DRAFT: '草稿',
  PREPARING: '准备中',
  READY: '待开始',
  IN_PROGRESS: '进行中',
  PAUSED: '已暂停',
  FAILED: '准备失败',
  FINISHING: '生成报告中',
  REPORT_FAILED: '报告失败',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
export const processingTurn = (status?: string) =>
  ['SUBMITTED', 'TRANSCRIBING', 'ANALYZING'].includes(status || '');
export function interviewLink(item: Pick<Interview, 'id' | 'status'>) {
  return `/interviews/${item.id}/${['COMPLETED', 'FINISHING', 'REPORT_FAILED'].includes(item.status) ? 'report' : 'room'}`;
}
export function remainingSeconds(item: Interview, since: number, now = Date.now()) {
  const elapsed =
    item.elapsed_seconds + (item.status === 'IN_PROGRESS' ? Math.max(0, (now - since) / 1000) : 0);
  return Math.max(0, Math.ceil(item.config.duration_minutes * 60 - elapsed));
}
export const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function dateText(value: string, options?: Intl.DateTimeFormatOptions) {
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized).toLocaleDateString('zh-CN', options || { month: '2-digit', day: '2-digit' });
}
export const difficulties = { EASY: '轻松入门', MEDIUM: '标准难度', HARD: '挑战进阶' };
