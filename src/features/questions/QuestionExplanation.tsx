import { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, LoaderCircle, RotateCcw } from 'lucide-react';
import { practiceApi } from '../../services/practice';
import { completeOperation, operationKey } from '../../services/client';
import { useSession } from '../../stores/session';
import { ErrorState, Loading } from '../../components/common/ui';
import '../../styles/question-explanation.css';

export default function QuestionExplanation({
  sessionId,
  prominent = false,
}: {
  sessionId: string;
  prominent?: boolean;
}) {
  const uid = useSession((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const queryClient = useQueryClient();
  const queryKey = ['practice-explanation', uid, sessionId];
  const query = useQuery({
    queryKey,
    queryFn: () => practiceApi.explanation(sessionId),
    enabled: open,
    refetchInterval: (query) =>
      ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(
        query.state.data?.status || '',
      )
        ? 1500
        : false,
  });
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setStarting(true);
    setError(null);
    const scope = `practice-explanation:${uid}:${sessionId}:${query.data?.task_id || 'first'}`;
    try {
      const result = await practiceApi.requestExplanation(
        sessionId,
        operationKey(scope),
      );
      completeOperation(scope);
      queryClient.setQueryData(queryKey, result);
    } catch (failure) {
      setError(failure);
    } finally {
      lock.current = false;
      setStarting(false);
    }
  }
  useEffect(() => {
    if (open && query.data?.status === 'NOT_REQUESTED' && !starting && !error)
      void start();
  }, [open, query.data?.status, starting, error]);
  useEffect(() => {
    setOpen(false);
    setError(null);
  }, [sessionId]);
  const result = query.data?.explanation;
  return (
    <div
      className={`practice-explanation-entry ${prominent ? 'is-prominent' : ''}`}
    >
      <button
        className={`btn ${prominent ? 'primary' : 'secondary'}`}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={16} />
        查阅本题讲解
      </button>
      <Modal
        open={open}
        title="本题讲解 · AI 参考作答"
        footer={null}
        width={860}
        centered
        destroyOnHidden
        onCancel={() => setOpen(false)}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <ErrorState
          error={error || query.error}
          retry={() => (error ? void start() : void query.refetch())}
        />
        {result ? (
          <div className="question-explanation">
            <p className="explanation-overview">{result.overview}</p>
            {result.items.map((item) => (
              <article className="explanation-answer" key={item.round_no}>
                <span>
                  {item.round_no === 1
                    ? '原题讲解'
                    : `追问 ${item.round_no - 1} 讲解`}
                </span>
                <h3>{item.question}</h3>
                <h4>参考作答</h4>
                <p className="explanation-answer-text">{item.answer}</p>
                <h4>关键知识点</h4>
                <ul>
                  {item.key_points.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
                {item.common_mistakes.length > 0 && (
                  <>
                    <h4>常见误区</h4>
                    <ul>
                      {item.common_mistakes.map((mistake, index) => (
                        <li key={index}>{mistake}</li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            ))}
            <p className="explanation-disclaimer">{result.disclaimer}</p>
          </div>
        ) : query.data?.status === 'FAILED' ? (
          <div className="explanation-pending">
            <BookOpen size={32} />
            <h3>本题讲解暂未生成</h3>
            <p>你的作答与复盘均已保存，可以稍后重试。</p>
            <button
              className="btn primary"
              disabled={starting}
              onClick={() => void start()}
            >
              <RotateCcw size={15} />
              重新生成讲解
            </button>
          </div>
        ) : !query.error && !error ? (
          <div className="explanation-pending">
            {query.isPending ? (
              <Loading label="正在读取本题讲解…" />
            ) : (
              <>
                <LoaderCircle size={30} className="spin" />
                <h3>AI 正在整理原题与追问的参考作答</h3>
                <p>
                  {query.data?.status === 'RETRYING'
                    ? 'AI 服务短暂繁忙，正在自动重试。'
                    : '讲解包含直接作答、关键知识点与常见误区。'}
                  你可以关闭窗口，稍后再次查阅。
                </p>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
