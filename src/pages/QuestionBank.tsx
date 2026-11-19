import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App, Pagination, Tabs } from 'antd';
import {
  ArrowRight,
  BookOpen,
  Check,
  Crown,
  History,
  LockKeyhole,
  RotateCcw,
  Target,
} from 'lucide-react';
import { PageHeading, ErrorState, Loading } from '../components/common/ui';
import { useSession } from '../stores/session';
import { practiceApi } from '../services/practice';
import { ApiError, completeOperation, operationKey } from '../services/client';
import {
  VipUpgradeButton,
  VipUpgradeModal,
} from '../features/billing/VipUpgrade';
import type {
  PracticeQuota,
  PracticeSession,
} from '../features/questions/types';
import '../styles/question-practice.css';
import CompanyBrand from '../features/questions/CompanyBrand';

function PracticeBenefits({ quota }: { quota?: PracticeQuota }) {
  return (
    <section
      className={`practice-benefits ${quota?.unlimited ? 'is-vip' : ''}`}
      aria-label="真题练习权益"
    >
      <span className="practice-crown">
        <Crown size={25} />
      </span>
      <div>
        <strong>
          {quota?.membership.active
            ? 'VIP 会员'
            : '精选真题先体验，升级 VIP 练全部'}
        </strong>
        <p>
          {quota?.unlimited
            ? `全部已发布真题可练 · 有效期至 ${new Date(quota.membership.expires_at!).toLocaleDateString('zh-CN')}`
            : `首家公司的前 ${(quota?.base_limit ?? 0) + (quota?.reward_unlocks ?? 0)} 道对应岗位题目可体验；每完成一次模拟面试奖励 ${quota?.rules.interview_reward ?? '—'} 次解锁。`}
        </p>
      </div>
      <div className="practice-benefits-right">
        <b>
          {quota?.unlimited
            ? '全部题目'
            : `${quota?.remaining_unlocks ?? '—'} 次`}
        </b>
        <small>{quota?.unlimited ? '不限题目解锁数' : '剩余解锁机会'}</small>
      </div>
      <VipUpgradeButton />
    </section>
  );
}

export default function QuestionBank() {
  const uid = useSession((s) => s.user?.id);
  const live = useSession((s) => s.mode) === 'live';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('companies');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [vipOpen, setVipOpen] = useState(false);
  const { message } = App.useApp();
  const position = params.get('position') || '';
  const positions = useQuery({
    queryKey: ['practice-positions'],
    queryFn: practiceApi.positions,
    enabled: live,
  });
  const selectedPosition = positions.data?.find(
    (item) => item.code === position,
  );
  const companies = useQuery({
    queryKey: ['practice-companies', position],
    queryFn: () => practiceApi.companies(position),
    enabled: live && !!selectedPosition,
  });
  const quota = useQuery({
    queryKey: ['practice-quota', uid],
    queryFn: practiceApi.quota,
    enabled: live,
  });
  const companyId =
    params.get('company') ||
    companies.data?.find((item) => item.question_count > 0)?.id ||
    companies.data?.[0]?.id ||
    '';
  const company = companies.data?.find((item) => item.id === companyId);
  const questions = useQuery({
    queryKey: ['company-questions', uid, companyId, position, page],
    queryFn: () => practiceApi.questions(companyId, position, page),
    enabled: live && !!selectedPosition && !!companyId && tab === 'companies',
  });
  const history = useQuery({
    queryKey: ['practice-history', uid, historyPage],
    queryFn: () => practiceApi.history(historyPage),
    enabled: live && tab === 'history',
  });
  const positionNames = Object.fromEntries(
    (positions.data || []).map((item) => [item.code, item.name]),
  );
  const trialCompany = companies.data?.find(
    (item) => item.id === questions.data?.trial_company_id,
  );
  function filter(company: string, role: string) {
    setPage(1);
    setParams({ ...(company ? { company } : {}), position: role });
  }
  async function begin(id: string, override?: PracticeSession) {
    const role = override?.position_code || position;
    const companyKey = override?.company_id || companyId;
    if (!role) {
      setTab('companies');
      void message.info('请先选择本次练习岗位');
      return;
    }
    const scope = `practice-start:${uid}:${companyKey}:${id}:${role}:${override ? 'again' : 'new'}`;
    setStarting(id);
    setError(null);
    try {
      const session = await practiceApi.start(
        companyKey,
        id,
        role,
        operationKey(scope),
        !!override,
      );
      completeOperation(scope);
      navigate(`/question-bank/practice/${session.id}`);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        ['QUESTION_VIP_REQUIRED', 'QUESTION_UNLOCK_REQUIRED'].includes(
          failure.code,
        )
      )
        setVipOpen(true);
      else {
        setError(failure);
        void message.error(
          failure instanceof Error ? failure.message : '暂时无法开始作答',
        );
      }
    } finally {
      setStarting('');
    }
  }
  return (
    <div className="question-bank-page">
      <PageHeading
        eyebrow="PRACTICE WITH PURPOSE"
        title="大厂面试真题实操"
        description="先选目标岗位，再按公司练真题。独立作答、深入追问，用复盘找到进步方向。"
      />
      {!live ? (
        <section className="panel practice-empty">
          <BookOpen size={36} />
          <h2>登录账号，开启真题实操</h2>
          <p>保存作答记录、解锁题目并查看 AI 评分。</p>
          <Link className="btn primary" to="/login">
            前往登录
          </Link>
        </section>
      ) : (
        <>
          <PracticeBenefits quota={quota.data} />
          <ErrorState
            error={
              error ||
              positions.error ||
              companies.error ||
              quota.error ||
              questions.error ||
              history.error
            }
          />
          {quota.data && !quota.data.rules.enabled && (
            <p className="practice-empty panel">
              真题实操正在维护，稍后再来看看。
            </p>
          )}
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'companies',
                label: (
                  <span className="inline">
                    <Target size={16} />
                    按岗位练习
                  </span>
                ),
              },
              {
                key: 'history',
                label: (
                  <span className="inline">
                    <History size={16} />
                    我的实操记录
                  </span>
                ),
              },
            ]}
          />
          {tab === 'companies' ? (
            <>
              <section
                className="panel practice-position-section"
                aria-label="先选择练习岗位"
              >
                <div className="practice-position-heading">
                  <span className="practice-step-number">01</span>
                  <div>
                    <h2>选择你要练习的岗位</h2>
                    <p>题目与公司数量会根据所选岗位筛选。</p>
                  </div>
                </div>
                {positions.isLoading ? (
                  <Loading label="正在加载岗位…" />
                ) : (
                  <div className="practice-position-grid">
                    {positions.data?.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        aria-pressed={item.code === position}
                        className={item.code === position ? 'selected' : ''}
                        onClick={() => filter('', item.code)}
                      >
                        {item.name}
                        {item.code === position && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </section>
              {!selectedPosition ? (
                <section className="panel practice-empty practice-select-first">
                  <Target size={38} />
                  <h3>选定岗位，再开始你的真题练习</h3>
                  <p>为你展示适用于目标岗位的公司题库。</p>
                </section>
              ) : (
                <>
                  <div className="practice-company-heading">
                    <span className="practice-step-number">02</span>
                    <h2>选择公司 · {selectedPosition.name}</h2>
                  </div>
                  <div
                    className="practice-company-grid"
                    aria-label="按公司选择题库"
                  >
                    {companies.data?.map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={companyId === item.id}
                        className={`practice-company ${companyId === item.id ? 'selected' : ''}`}
                        onClick={() => filter(item.id, position)}
                      >
                        <CompanyBrand company={item} />
                        <strong>{item.name}</strong>
                        <small>{item.question_count} 道岗位真题</small>
                        {companyId === item.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <section className="panel practice-question-panel">
                    <div className="practice-list-heading">
                      <div>
                        <h2>
                          {company?.name || '公司'} · {selectedPosition.name}
                          面试题
                        </h2>
                        <p>文字或语音作答，最多三轮追问与多维评分。</p>
                      </div>
                    </div>
                    {!quota.data?.unlimited && trialCompany && (
                      <div className="practice-trial-note">
                        普通用户可体验 <b>{trialCompany.name}</b> 的前{' '}
                        <b>{questions.data?.trial_question_limit}</b>{' '}
                        道岗位题目。其他题目开通 VIP
                        后查看并作答，模拟面试奖励会增加体验题数。
                      </div>
                    )}
                    {questions.isLoading || companies.isLoading ? (
                      <Loading label="正在加载面试题…" />
                    ) : !questions.data?.items.length ? (
                      <div className="practice-empty">
                        <BookOpen size={32} />
                        <h3>暂时没有该岗位的已发布题目</h3>
                        <p>切换公司或岗位，再挑选适合你的题目。</p>
                      </div>
                    ) : (
                      <div className="practice-question-list">
                        {questions.data.items.map((question, index) => (
                          <article
                            className={`practice-question-row ${question.masked ? 'is-masked' : ''}`}
                            key={question.id}
                            onClick={
                              question.masked
                                ? () => setVipOpen(true)
                                : undefined
                            }
                          >
                            <span className="practice-question-number">
                              {String((page - 1) * 15 + index + 1).padStart(
                                2,
                                '0',
                              )}
                            </span>
                            <div className="practice-question-info">
                              {question.masked ? (
                                <>
                                  <div className="practice-masked-title">
                                    <LockKeyhole size={16} />
                                    VIP 专享面试题
                                  </div>
                                  <div
                                    className="practice-mask-bars"
                                    aria-label="题目内容已脱敏"
                                  >
                                    <i />
                                    <i />
                                    <i />
                                  </div>
                                </>
                              ) : (
                                <h3>{question.question_text}</h3>
                              )}
                              <div className="practice-tags">
                                <span>{question.question_type}</span>
                                {question.position_codes_json
                                  .slice(0, 3)
                                  .map((code) => (
                                    <span key={code}>
                                      {positionNames[code] || code}
                                    </span>
                                  ))}
                              </div>
                            </div>
                            <button
                              className={`btn ${question.masked ? 'vip-upgrade-button' : question.unlocked ? 'secondary' : 'primary'}`}
                              disabled={
                                !!starting || !quota.data?.rules.enabled
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (question.masked) setVipOpen(true);
                                else void begin(question.id);
                              }}
                            >
                              {question.masked ? (
                                <Crown size={16} />
                              ) : (
                                <BookOpen size={16} />
                              )}
                              {starting === question.id
                                ? '正在进入…'
                                : question.masked
                                  ? '开通 VIP 解锁'
                                  : question.unlocked
                                    ? '进入作答'
                                    : '开始作答'}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                    {!!questions.data?.total && (
                      <Pagination
                        current={page}
                        total={questions.data.total}
                        pageSize={15}
                        showSizeChanger={false}
                        onChange={setPage}
                      />
                    )}
                  </section>
                  <div className="practice-reward-note">
                    <span>练一场完整模拟面试，再解锁新的真题。</span>
                    <Link to="/interviews/new">
                      开始模拟面试
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              )}
            </>
          ) : (
            <section className="panel practice-history">
              {history.isLoading ? (
                <Loading label="正在加载作答记录…" />
              ) : !history.data?.items.length ? (
                <div className="practice-empty">
                  <History size={32} />
                  <h3>你的第一道真题，从这里开始</h3>
                  <p>作答、追问与评分都会保存在这里。</p>
                  <button
                    className="btn primary"
                    onClick={() => setTab('companies')}
                  >
                    去挑选题目
                  </button>
                </div>
              ) : (
                history.data.items.map((session) => (
                  <article key={session.id} className="practice-history-row">
                    <CompanyBrand company={session.company} compact />
                    <div>
                      <Link to={`/question-bank/practice/${session.id}`}>
                        <strong>{session.question.question_text}</strong>
                      </Link>
                      <p>
                        {session.company.name} ·{' '}
                        {positionNames[session.position_code || ''] ||
                          '单题练习'}{' '}
                        · {new Date(session.created_at).toLocaleString('zh-CN')}{' '}
                        · 已回答{' '}
                        {session.rounds.filter((round) => round.answer).length}{' '}
                        轮
                      </p>
                    </div>
                    <Link
                      className="btn secondary small"
                      to={`/question-bank/practice/${session.id}`}
                    >
                      {session.status === 'COMPLETED'
                        ? '查看复盘'
                        : session.status === 'FINISHING'
                          ? '复盘生成中'
                          : session.status === 'REPORT_FAILED'
                            ? '查看并重试'
                            : '继续作答'}
                    </Link>
                    {session.status === 'COMPLETED' && (
                      <button
                        className="btn primary small"
                        disabled={!!starting}
                        onClick={() => void begin(session.question_id, session)}
                      >
                        <RotateCcw size={14} />
                        再次作答
                      </button>
                    )}
                  </article>
                ))
              )}
              {!!history.data?.total && (
                <Pagination
                  current={historyPage}
                  total={history.data.total}
                  pageSize={10}
                  showSizeChanger={false}
                  onChange={setHistoryPage}
                />
              )}
            </section>
          )}
        </>
      )}
      <VipUpgradeModal open={vipOpen} onClose={() => setVipOpen(false)} />
    </div>
  );
}
