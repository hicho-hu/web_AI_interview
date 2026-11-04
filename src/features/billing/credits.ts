import type { Mode, ModeCredits, User } from '../../types/domain';

export const creditModes: Mode[] = ['TEXT', 'VOICE', 'VIDEO'];
export const creditLabels: Record<Mode, string> = { TEXT: '文字', VOICE: '语音', VIDEO: '视频' };
export const emptyCredits = (): ModeCredits => ({ TEXT: 0, VOICE: 0, VIDEO: 0 });

export function availableCredits(
  balance: Pick<User, 'remaining_interviews' | 'universal_interviews' | 'interview_credits'>,
  mode: Mode,
) {
  return balance.interview_credits
    ? balance.interview_credits[mode] + (balance.universal_interviews ?? 0)
    : balance.remaining_interviews;
}

export function creditsText(product: { credits: number; interview_credits?: ModeCredits | null }) {
  return product.interview_credits
    ? creditModes.map((mode) => `${creditLabels[mode]} ${product.interview_credits![mode]} 次`).join(' + ')
    : `通用 ${product.credits} 次`;
}

export function sameCredits(
  first: { credits: number; interview_credits?: ModeCredits | null },
  second: { credits: number; interview_credits?: ModeCredits | null },
) {
  return (
    first.credits === second.credits &&
    !!first.interview_credits === !!second.interview_credits &&
    creditModes.every((mode) => first.interview_credits?.[mode] === second.interview_credits?.[mode])
  );
}
