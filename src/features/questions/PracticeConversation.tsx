import { Fragment } from 'react';
import { LoaderCircle, Pause, Volume2 } from 'lucide-react';
import AIInterviewerAvatar from '../../components/common/AIInterviewerAvatar';
import VipAvatar from '../../components/common/VipAvatar';
import { useSession } from '../../stores/session';
import { useQuestionAudio } from './useQuestionAudio';
import type { PracticeRound } from './types';

export default function PracticeConversation({
  sessionId,
  rounds,
  suspended = false,
}: {
  sessionId: string;
  rounds: PracticeRound[];
  suspended?: boolean;
}) {
  const nickname = useSession((s) => s.user?.nickname) || '我';
  const speech = useQuestionAudio(sessionId, suspended);
  return (
    <div
      className="practice-chat"
      role="log"
      aria-label="作答聊天记录"
      aria-live="polite"
      aria-relevant="additions"
    >
      {rounds.map((round) => (
        <Fragment key={round.round_no}>
          <article
            className="practice-chat-message is-interviewer"
            aria-label={`AI面试官第${round.round_no}轮提问`}
          >
            <AIInterviewerAvatar />
            <div className="practice-chat-content">
              <div className="practice-chat-meta">
                <strong>AI面试官</strong>
                <span>
                  {round.round_no === 1 ? '首问' : '深入追问'} · 第{' '}
                  {round.round_no} 轮
                </span>
              </div>
              <div className="practice-chat-bubble">
                <p>
                  {round.question}{' '}
                  <button
                    type="button"
                    className={`practice-question-audio ${speech.playing === round.round_no ? 'is-playing' : ''}`}
                    aria-label={
                      speech.loading === round.round_no
                        ? `正在准备第${round.round_no}轮问题语音`
                        : speech.playing === round.round_no
                          ? `暂停第${round.round_no}轮问题`
                          : `播放第${round.round_no}轮问题`
                    }
                    title={
                      speech.playing === round.round_no
                        ? '暂停朗读'
                        : '朗读问题'
                    }
                    aria-pressed={speech.playing === round.round_no}
                    disabled={speech.loading !== null}
                    onClick={() => void speech.toggle(round.round_no)}
                  >
                    {speech.loading === round.round_no ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : speech.playing === round.round_no ? (
                      <Pause size={17} />
                    ) : (
                      <Volume2 size={17} />
                    )}
                  </button>
                </p>
              </div>
              {speech.error?.round === round.round_no && (
                <p className="practice-question-audio-error" role="alert">
                  {speech.error.message}
                </p>
              )}
            </div>
          </article>
          {round.answer !== null && (
            <article
              className="practice-chat-message is-user"
              aria-label={`我的第${round.round_no}轮回答`}
            >
              <VipAvatar className="avatar practice-chat-avatar" />
              <div className="practice-chat-content">
                <div className="practice-chat-meta">
                  <strong>{nickname}</strong>
                  <span>
                    我的回答{round.mode === 'VOICE' ? ' · 语音转写' : ''}
                  </span>
                </div>
                <div className="practice-chat-bubble">
                  <p>{round.answer}</p>
                </div>
              </div>
            </article>
          )}
        </Fragment>
      ))}
    </div>
  );
}
