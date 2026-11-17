import ResumeLibrary from '../features/resumes/ResumeLibrary';
import { useRef, useState } from 'react';
import { App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Mic,
  Search,
  BriefcaseBusiness,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import type { Config, Job, JobInput } from '../types/domain';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { useSession } from '../stores/session';
import { queryClient } from '../app/query';
import { defaultConfig, configSchema, jobSchema } from '../features/interviews/schema';
import { ErrorState, PageHeading } from '../components/common/ui';
import { difficulties, modeLabels } from '../utils/interview';
import { availableCredits, creditLabels } from '../features/billing/credits';
import { useDialogFocus } from '../components/common/useDialogFocus';
import { readyJob } from '../features/jobs/prepare';
import {
  filterJobFunctions,
  jobFunctionGroups,
  jobFunctionSource,
  type JobFunction,
} from '../features/jobs/functionCatalog';

export default function NewInterview() {
  const [job, setJob] = useState<JobInput>({ job_title: '', jd_text: '', seniority: 'MIDDLE' });
  const [config, setConfig] = useState<Config>({ ...defaultConfig });
  const [resumeId, setResumeId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [agreed, setAgreed] = useState(false);
  const [creationIssue, setCreationIssue] = useState<'consent' | 'quota' | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const jobPickerRef = useRef<HTMLElement>(null);
  useDialogFocus(jobPickerOpen, jobPickerRef, () => setJobPickerOpen(false));
  const [jobSearch, setJobSearch] = useState('');
  const [jobCategory, setJobCategory] = useState('ALL');
  const [jobMiddle, setJobMiddle] = useState('');
  const [selectedFunctions, setSelectedFunctions] = useState<JobFunction[]>([]);
  const agreementInput = useRef<HTMLInputElement | null>(null);
  const cachedJob = useRef<{ payload: string; id: string } | null>(null);
  const { mode, user, setUser } = useSession();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const query = jobSearch.trim().toLocaleLowerCase();
  const savedJobOptions = (jobs.data?.items ?? []).filter((item) =>
    `${item.job_title} ${item.jd_text}`.toLocaleLowerCase().includes(query),
  );
  const categoryGroups = jobFunctionGroups.filter(
    (item) => jobCategory === 'ALL' || item.code === jobCategory,
  );
  const middleOptions = [
    ...new Map(
      categoryGroups.flatMap((item) => item.children).map((item) => [item.code, item.name]),
    ).entries(),
  ];
  const leafOptions = filterJobFunctions({
    categoryCode: jobCategory === 'ALL' ? undefined : jobCategory,
    subcategoryCode: jobMiddle || undefined,
    search: query,
  });
  function chooseJob(item: Job) {
    setJob({ job_title: item.job_title, jd_text: item.jd_text, seniority: item.seniority });
    cachedJob.current = {
      payload: JSON.stringify({
        job_title: item.job_title,
        jd_text: item.jd_text,
        seniority: item.seniority,
      }),
      id: item.id,
    };
    setJobPickerOpen(false);
  }
  function toggleFunction(item: JobFunction) {
    if (!selectedFunctions.some((selected) => selected.code === item.code) && selectedFunctions.length >= 3) {
      void message.warning('最多选择三个岗位');
      return;
    }
    setSelectedFunctions((current) => {
      if (current.some((selected) => selected.code === item.code))
        return current.filter((selected) => selected.code !== item.code);
      return current.length < 3 ? [...current, item] : current;
    });
  }
  function confirmFunctions() {
    const items = selectedFunctions;
    if (!items.length) return;
    const saved =
      items.length === 1
        ? jobs.data?.items.find((profile) => profile.job_title === items[0].name)
        : undefined;
    const next: JobInput = {
      ...job,
      job_title: items.map((item) => item.name).join('、'),
      jd_text: job.jd_text || saved?.jd_text || '',
    };
    setJob(next);
    cachedJob.current = null;
    setJobPickerOpen(false);
  }
  function changeConfig<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    if (key === 'mode' && creationIssue === 'quota') {
      setCreationIssue(null);
      setError(null);
    }
  }
  async function create() {
    if (busy || uploading) return;
    setError(null);
    setCreationIssue(null);
    const parsed = jobSchema.safeParse(job);
    const parsedConfig = configSchema.safeParse(config);
    if (!parsed.success || !parsedConfig.success) {
      setError(new Error(!parsed.success ? parsed.error.issues[0].message : '请检查面试配置'));
      return;
    }
    if (!agreed) {
      setCreationIssue('consent');
      setError(new Error('请先确认授权 AI 使用本次岗位和回答内容'));
      agreementInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      setPhase('核对授权与练习额度');
      await api.ensureConsents(['PRIVACY', 'TERMS', 'AI_PROCESSING']);
      const me = await api.me();
      setUser(me);
      queryClient.setQueryData(['me'], me);
      if (availableCredits(me, config.mode) < 1) {
        setCreationIssue('quota');
        throw new Error(
          `当前可用练习次数不足：${creditLabels[config.mode]}面试次数不足，无法创建新面试。未开始的面试也会预占对应类型额度。`,
        );
      }
      const payload = JSON.stringify(parsed.data);
      setPhase('正在解析岗位，提取重点能力');
      if (cachedJob.current?.payload !== payload) {
        const created = await api.createJob(parsed.data);
        cachedJob.current = { payload, id: created.id };
      }
      const ready = await readyJob(cachedJob.current!.id, { onProgress: setPhase });
      setPhase('正在生成专属面试计划');
      const input = {
        job_profile_id: ready.id,
        ...(resumeId ? { resume_asset_id: resumeId } : {}),
        config: parsedConfig.data,
      };
      const scope = `create:${JSON.stringify(input)}`;
      const result = await api.create(input, operationKey(scope));
      completeOperation(scope);
      void queryClient.invalidateQueries({ queryKey: ['history-all'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['entitlements'] });
      navigate(`/interviews/${result.interview_id}/room`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }
  return (
    <div>
      <Link className="back-link" to="/dashboard">
        <ArrowLeft size={15} />
        返回工作台
      </Link>
      <PageHeading
        eyebrow="A LITTLE PREPARATION. A BIG DIFFERENCE."
        title="为下一次面试，做好准备"
        description="告诉我们你的目标，让这场练习更贴近真实机会。"
      />
      <div className="create-layout">
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <section className="panel form-panel">
            <div className="form-section-heading">
              <span className="step-circle">01</span>
              <div>
                <h2>你的目标岗位</h2>
                <p>面试问题将围绕岗位要求，为你量身定制</p>
              </div>
              <FileText size={20} />
            </div>
            <div className="field">
              <label htmlFor="job-title">
                岗位名称<span className="required">*</span>
              </label>
              <input
                id="job-title"
                required
                maxLength={100}
                value={job.job_title}
                onChange={(e) => setJob({ ...job, job_title: e.target.value })}
                placeholder="填写目标岗位，也可以从工作职能选择"
              />
              <button
                type="button"
                className="job-picker-trigger"
                aria-haspopup="dialog"
                onClick={() => setJobPickerOpen(true)}
              >
                <BriefcaseBusiness size={17} />
                <span>从工作职能选择岗位</span>
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                目标级别
                <select
                  value={job.seniority}
                  onChange={(e) => setJob({ ...job, seniority: e.target.value as JobInput['seniority'] })}
                >
                  <option value="JUNIOR">初级 · 0–2 年</option>
                  <option value="MIDDLE">中级 · 2–5 年</option>
                  <option value="SENIOR">高级 · 5 年以上</option>
                  <option value="EXPERT">专家 / 负责人</option>
                </select>
              </label>
            </div>
            <label className="field">
              岗位描述 JD<span className="required">*</span>
              <textarea
                required
                rows={7}
                maxLength={30000}
                value={job.jd_text}
                onChange={(e) => setJob({ ...job, jd_text: e.target.value })}
                placeholder={
                  '粘贴目标岗位的职责、任职要求、技能和经验要求…\n\n越完整的 JD，越有针对性的面试。'
                }
              />
              <span className="field-footer">
                <span>
                  <Sparkles size={12} />
                  AI 将提取岗位的核心能力要求
                </span>
                <span>{job.jd_text.length.toLocaleString()} / 30,000</span>
              </span>
            </label>
            <label className="field">
              个人简历<span className="optional">选填 · 有助于针对项目经历提问</span>
            </label>
            {mode === 'demo' ? (
              <div className="upload-disabled">
                <LockKeyhole size={19} />
                <span>简历上传在真实后端模式下使用，演示模式不收集简历文件</span>
              </div>
            ) : (
              <ResumeLibrary selectedId={resumeId} onSelect={setResumeId} onBusy={setUploading} />
            )}
          </section>
          <section className="panel form-panel">
            <div className="form-section-heading">
              <span className="step-circle">02</span>
              <div>
                <h2>选择你的练习方式</h2>
                <p>按自己的节奏，找到适合你的挑战</p>
              </div>
              <Sparkles size={20} />
            </div>
            <label className="field-label">面试模式</label>
            <div className="mode-options">
              {(
                [
                  { mode: 'TEXT', icon: MessageSquare, caption: '专注思考，沉淀回答' },
                  { mode: 'VOICE', icon: Mic, caption: '连续对话，全程录音' },
                  { mode: 'VIDEO', icon: Video, caption: '数字人对话，分屏录像' },
                ] as const
              ).map(({ mode: m, icon: Icon, caption }) => (
                <button
                  disabled={mode === 'demo' && m !== 'TEXT'}
                  type="button"
                  className={`mode-option ${config.mode === m ? 'selected' : ''}`}
                  key={m}
                  onClick={() => changeConfig('mode', m)}
                >
                  <Icon size={24} />
                  <strong>{modeLabels[m]}</strong>
                  <small>{mode === 'demo' && m !== 'TEXT' ? '连接后端后可用' : caption}</small>
                  {config.mode === m && <Check className="selected-check" size={13} />}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="field">
                面试难度
                <select
                  value={config.difficulty}
                  onChange={(e) => changeConfig('difficulty', e.target.value as Config['difficulty'])}
                >
                  {Object.entries(difficulties).map(([v, t]) => (
                    <option value={v} key={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                预计时长
                <select
                  value={config.duration_minutes}
                  onChange={(e) =>
                    changeConfig('duration_minutes', Number(e.target.value) as Config['duration_minutes'])
                  }
                >
                  {[15, 30, 45].map((n) => (
                    <option key={n} value={n}>
                      {n} 分钟
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>提问节奏</span>
                <p className="muted">根据剩余时间自动调整题数，优先围绕最近两家公司的经历展开。</p>
              </div>
              <label className="field">
                面试语言
                <select
                  value={config.language}
                  onChange={(e) => changeConfig('language', e.target.value as Config['language'])}
                >
                  <option value="zh-CN">中文 · 普通话</option>
                  <option value="en-US">English · 英语</option>
                </select>
              </label>
              <label className="field">
                面试类型
                <select
                  value={config.interview_type}
                  onChange={(e) => changeConfig('interview_type', e.target.value as Config['interview_type'])}
                >
                  <option value="COMPREHENSIVE">综合面试</option>
                  <option value="TECHNICAL">专业技术</option>
                  <option value="BEHAVIORAL">行为情境</option>
                </select>
              </label>
              <label className="field">
                每题最多追问
                <select
                  disabled={!config.allow_follow_up}
                  value={config.max_follow_ups}
                  onChange={(e) => changeConfig('max_follow_ups', Number(e.target.value))}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} 次
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="switch-field">
              <input
                type="checkbox"
                checked={config.allow_follow_up}
                onChange={(e) => changeConfig('allow_follow_up', e.target.checked)}
              />
              <div>
                <strong>允许 AI 动态追问</strong>
                <p>围绕你的回答深入交流，接近真实面试体验</p>
              </div>
            </label>
          </section>
          <div className="mobile-plan-summary">
            <strong>
              {modeLabels[config.mode]} · {config.duration_minutes} 分钟 · 题数随时间调整
            </strong>
            <span>
              本次预占 1 次{creditLabels[config.mode]}面试 · 可用{' '}
              {user ? availableCredits(user, config.mode) : '—'} 次
            </span>
            <Link className="text-link" to="/billing">
              查看或购买权益
              <ArrowRight size={14} />
            </Link>
          </div>
          <label className="agreement create-agreement">
            <input
              ref={agreementInput}
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (creationIssue === 'consent') {
                  setCreationIssue(null);
                  setError(null);
                }
              }}
            />
            <span>我同意使用以上岗位、可选简历和回答内容进行 AI 面试处理。可在个人中心查看和撤回授权。</span>
          </label>
          {error !== null && <ErrorState error={error} />}
          {creationIssue === 'quota' && (
            <div className="info-banner">
              <span>可继续已有面试，或取消尚未开始的面试释放预占额度。</span>
              <Link className="text-link" to="/history">
                查看面试记录
              </Link>
              <Link className="text-link" to="/billing">
                购买练习权益
              </Link>
            </div>
          )}
          <div className="form-actions">
            <Link className="btn secondary" to="/dashboard">
              稍后再练
            </Link>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || uploading}
              aria-describedby="create-submit-note"
            >
              {busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
              {busy ? phase : '创建专属面试'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </div>
          <p id="create-submit-note" className="create-submit-note" role="status">
            {busy
              ? phase
              : uploading
                ? '简历正在上传并解析，完成后即可创建面试。'
                : !agreed
                  ? '创建前，请先勾选上方 AI 面试处理授权。'
                  : (user ? availableCredits(user, config.mode) : 1) < 1
                    ? '当前显示无可用额度，点击创建会重新核对最新额度。'
                    : '已准备好，点击创建专属面试即可继续。'}
          </p>
        </form>
        <aside className="create-summary">
          <div className="panel summary-panel">
            <span className="summary-kicker">YOUR INTERVIEW PLAN</span>
            <h3>一次专属于你的练习</h3>
            <div className="summary-target">
              <span>
                <Sparkles size={23} />
              </span>
              <strong>{job.job_title || '你的目标岗位'}</strong>
              <small>有目标，练习才更有方向</small>
            </div>
            <dl>
              <div>
                <dt>面试方式</dt>
                <dd>{modeLabels[config.mode]}</dd>
              </div>
              <div>
                <dt>预计时长</dt>
                <dd>{config.duration_minutes} 分钟</dd>
              </div>
              <div>
                <dt>提问数量</dt>
                <dd>随剩余时间调整</dd>
              </div>
              <div>
                <dt>面试难度</dt>
                <dd>{difficulties[config.difficulty]}</dd>
              </div>
              <div>
                <dt>本次使用</dt>
                <dd>1 次{creditLabels[config.mode]}面试</dd>
              </div>
            </dl>
            <p className="summary-credits">
              当前可用于{creditLabels[config.mode]}面试{' '}
              <b>{user ? availableCredits(user, config.mode) : '—'}</b> 次 · 创建时预占，开始后扣除
            </p>
            <Link className="text-link" to="/billing">
              购买练习权益
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <strong>安心准备，放心表达</strong>
              <p>简历和回答仅用于你授权的面试训练。你可以随时查看和删除自己的数据。</p>
              <Link to="/profile">
                了解隐私与授权
                <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
      {jobPickerOpen && (
        <div
          className="job-picker-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setJobPickerOpen(false);
          }}
        >
          <section
            ref={jobPickerRef}
            className="job-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-picker-title"
          >
            <header>
              <div>
                <span>选择你的方向</span>
                <h2 id="job-picker-title">选择目标岗位</h2>
              </div>
              <button
                className="icon-btn"
                type="button"
                aria-label="关闭"
                onClick={() => setJobPickerOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            <label className="job-picker-search">
              <Search size={17} />
              <input
                data-dialog-focus
                aria-label="搜索岗位或工作职能"
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                placeholder="搜索岗位名称或工作职能"
              />
            </label>
            <div className="job-picker-tree">
              <nav aria-label="一级职能分类">
                <button
                  type="button"
                  aria-pressed={jobCategory === 'ALL'}
                  className={jobCategory === 'ALL' ? 'selected' : ''}
                  onClick={() => {
                    setJobCategory('ALL');
                    setJobMiddle('');
                  }}
                >
                  全部职能
                </button>
                {jobFunctionGroups.map(({ code, name }) => (
                  <button
                    type="button"
                    key={code}
                    aria-pressed={jobCategory === code}
                    className={jobCategory === code ? 'selected' : ''}
                    onClick={() => {
                      setJobCategory(code);
                      setJobMiddle('');
                    }}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <nav aria-label="二级职能分类">
                <button
                  type="button"
                  aria-pressed={!jobMiddle}
                  className={!jobMiddle ? 'selected' : ''}
                  onClick={() => setJobMiddle('')}
                >
                  全部细分职能
                </button>
                {middleOptions.map(([code, name]) => (
                  <button
                    type="button"
                    key={code}
                    aria-pressed={jobMiddle === code}
                    className={jobMiddle === code ? 'selected' : ''}
                    onClick={() => setJobMiddle(code)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <div className="job-picker-results">
                {selectedFunctions.length > 0 && (
                  <div className="job-picker-selected" aria-label="已选岗位">
                    已选 {selectedFunctions.length}/3：
                    {selectedFunctions.map((item) => (
                      <button
                        type="button"
                        key={item.code}
                        aria-label={`移除 ${item.name}`}
                        onClick={() => toggleFunction(item)}
                      >
                        {item.name} ×
                      </button>
                    ))}
                  </div>
                )}
                {savedJobOptions.map((item) => (
                  <button
                    type="button"
                    className="job-picker-option"
                    key={`saved-${item.id}`}
                    onClick={() => chooseJob(item)}
                  >
                    <span className="job-picker-icon">
                      <BriefcaseBusiness size={18} />
                    </span>
                    <span>
                      <strong>{item.job_title}</strong>
                      <small>{item.jd_text.slice(0, 110) || '选择后可补充岗位 JD'}</small>
                    </span>
                    <span className="job-picker-seniority">我的岗位</span>
                  </button>
                ))}
                {leafOptions.map((item) => (
                  <button
                    type="button"
                    aria-label={`选择 ${item.name}`}
                    aria-pressed={selectedFunctions.some((selected) => selected.code === item.code)}
                    className={`job-picker-option ${selectedFunctions.some((selected) => selected.code === item.code) ? 'selected' : ''}`}
                    key={`function-${item.code}`}
                    onClick={() => toggleFunction(item)}
                  >
                    <span className="job-picker-icon">
                      <BriefcaseBusiness size={18} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.categoryName} / {item.subcategoryName}
                      </small>
                    </span>
                    <span className="job-picker-seniority">
                      {selectedFunctions.some((selected) => selected.code === item.code)
                        ? '已选择'
                        : '选择岗位'}
                    </span>
                  </button>
                ))}
                {!savedJobOptions.length && !leafOptions.length && (
                  <div className="job-picker-empty">没有匹配的岗位，可以切换职能分类或使用自定义岗位。</div>
                )}
              </div>
            </div>
            <footer>
              <span>
                岗位分类参考{' '}
                <a href={jobFunctionSource.url} target="_blank" rel="noreferrer">
                  前程无忧「工作职能」
                </a>{' '}
                · 最多选择 3 个岗位
              </span>
              <button
                type="button"
                className="btn primary"
                onClick={confirmFunctions}
                disabled={!selectedFunctions.length}
              >
                确认选择
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setJob((current) => ({ ...current, job_title: current.job_title || jobSearch.trim() }));
                  cachedJob.current = null;
                  setJobPickerOpen(false);
                }}
              >
                使用自定义岗位
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
