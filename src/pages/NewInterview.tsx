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
  Paperclip,
  Search,
  BriefcaseBusiness,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { Config, Job, JobInput } from '../types/domain';
import { api } from '../services/api';
import { completeOperation, operationKey } from '../services/client';
import { useSession } from '../stores/session';
import { queryClient } from '../app/query';
import { defaultConfig, configSchema, jobSchema } from '../features/interviews/schema';
import { uploadFile } from '../features/media/upload';
import { ErrorState, PageHeading } from '../components/common/ui';
import { difficulties, modeLabels } from '../utils/interview';
import { availableCredits, creditLabels } from '../features/billing/credits';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Occupation = { sn: string; name: string; desc?: string; worktypes?: string[]; majorCode: string; majorName: string; middleCode: string; middleName: string };
const occupationCategories: Record<string, string> = {
  '1': '党政机关与企事业管理',
  '2': '专业技术',
  '3': '办事与行政支持',
  '4': '社会生产与生活服务',
  '5': '农林牧渔',
  '6': '生产制造',
  '7': '军队',
  '8': '其他职业',
};
const occupationSources = [
  'https://raw.githubusercontent.com/leo4stone/ZHONGHUARENMINGONGHEGUOZHIYEFENLEIDADIAN/main/04_%E8%81%8C%E4%B8%9A%E5%88%86%E7%B1%BB%E5%A4%A7%E5%85%B82022_hierarchical.json',
  'https://cdn.jsdelivr.net/gh/leo4stone/ZHONGHUARENMINGONGHEGUOZHIYEFENLEIDADIAN@main/04_%E8%81%8C%E4%B8%9A%E5%88%86%E7%B1%BB%E5%A4%A7%E5%85%B82022_hierarchical.json',
];
async function loadOccupations(): Promise<Occupation[]> {
  let lastError: unknown;
  for (const source of occupationSources) {
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`职业目录加载失败（${response.status}）`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('职业目录格式无效');
      const output: Occupation[] = [];
      type Node = { sn?: string; name?: string; desc?: string; worktypes?: string[]; subclass?: Node[] };
      for (const rawMajor of data as Node[]) {
        const majorCode = rawMajor.sn ?? '';
        for (const middle of rawMajor.subclass ?? []) {
          const middleCode = middle.sn ?? '';
          const visit = (node: Node) => {
            if (node.sn?.split('-').length === 4 && node.name) output.push({
              sn: node.sn, name: node.name, desc: node.desc, worktypes: node.worktypes,
              majorCode, majorName: rawMajor.name ?? majorCode,
              middleCode, middleName: middle.name ?? middleCode,
            });
            (node.subclass ?? []).forEach(visit);
          };
          visit(middle);
        }
      }
      return output;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('职业目录暂时无法加载');
}
async function readyJob(id: string) {
  for (let i = 0; i < 90; i++) {
    const job = await api.job(id);
    if (job.status === 'READY') return job;
    if (job.status === 'FAILED') throw new Error('岗位解析失败，请检查 JD 内容或到后端检查任务');
    await wait(1500);
  }
  throw new Error('岗位解析耗时较长，请稍后重试；已有岗位将继续使用');
}
export default function NewInterview() {
  const [job, setJob] = useState<JobInput>({ job_title: '', jd_text: '', seniority: 'MIDDLE' });
  const [config, setConfig] = useState<Config>({ ...defaultConfig });
  const [resumeId, setResumeId] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [agreed, setAgreed] = useState(false);
  const [creationIssue, setCreationIssue] = useState<'consent' | 'quota' | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [jobCategory, setJobCategory] = useState('ALL');
  const [jobMiddle, setJobMiddle] = useState('');
  const [selectedOccupations, setSelectedOccupations] = useState<Occupation[]>([]);
  const agreementInput = useRef<HTMLInputElement | null>(null);
  const cachedJob = useRef<{ payload: string; id: string } | null>(null);
  const { mode, user, setUser } = useSession();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const occupationCatalog = useQuery({
    queryKey: ['occupation-catalog-2022'],
    queryFn: loadOccupations,
    enabled: jobPickerOpen,
    staleTime: Infinity,
    retry: 1,
  });
  const query = jobSearch.trim().toLocaleLowerCase();
  const savedJobOptions = (jobs.data?.items ?? []).filter((item) =>
    `${item.job_title} ${item.jd_text}`.toLocaleLowerCase().includes(query),
  );
  const allOccupations = occupationCatalog.data ?? [];
  const majorOptions = [...new Map(allOccupations.map((item) => [item.majorCode, item.majorName])).entries()];
  const middleOptions = [...new Map(allOccupations.filter((item) => jobCategory === 'ALL' || item.majorCode === jobCategory).map((item) => [item.middleCode, item.middleName])).entries()];
  const leafOptions = allOccupations.filter((item) =>
    (jobCategory === 'ALL' || item.majorCode === jobCategory) &&
    (!jobMiddle || item.middleCode === jobMiddle) &&
    `${item.name} ${item.desc ?? ''} ${(item.worktypes ?? []).join(' ')}`.toLocaleLowerCase().includes(query),
  ).slice(0, 160);
  function chooseJob(item: Job) {
    setJob({ job_title: item.job_title, jd_text: item.jd_text, seniority: item.seniority });
    cachedJob.current = {
      payload: JSON.stringify({ job_title: item.job_title, jd_text: item.jd_text, seniority: item.seniority }),
      id: item.id,
    };
    setJobPickerOpen(false);
  }
  function toggleOccupation(item: Occupation) {
    setSelectedOccupations((current) => {
      if (current.some((selected) => selected.sn === item.sn)) return current.filter((selected) => selected.sn !== item.sn);
      if (current.length >= 3) { void message.warning('最多选择三个岗位'); return current; }
      return [...current, item];
    });
  }
  function confirmOccupations() {
    const items = selectedOccupations;
    if (!items.length) return;
    const profiles = items.map((item) => jobs.data?.items.find((profile) => profile.job_title === item.name));
    const jdParts = items.map((item, index) => {
      const saved = profiles[index];
      if (saved?.jd_text) return `【${item.name}】\n${saved.jd_text}`;
      const duties = item.worktypes?.length ? `\n相关工种：${item.worktypes.join('、')}` : '';
      return `【${item.name}】\n${item.desc?.trim() || '可补充目标公司的具体岗位职责和任职要求。'}${duties}`;
    });
    const next = { job_title: items.map((item) => item.name).join('、'), jd_text: `${jdParts.join('\n\n')}\n\n请结合目标公司的业务场景和任职要求补充完善。`, seniority: 'MIDDLE' } as JobInput;
    setJob(next);
    cachedJob.current = profiles.length === 1 && profiles[0] ? { payload: JSON.stringify({ job_title: profiles[0].job_title, jd_text: profiles[0].jd_text, seniority: profiles[0].seniority }), id: profiles[0].id } : null;
    setJobPickerOpen(false);
  }
  function changeConfig<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    if (key === 'mode' && creationIssue === 'quota') {
      setCreationIssue(null);
      setError(null);
    }
  }
  async function upload(file: File) {
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      void message.error('请上传不超过 10 MB 的 PDF 或 DOCX 简历');
      return;
    }
    setUploading(true);
    setError(null);
    setResumeId('');
    try {
      await api.ensureConsents(['PRIVACY', 'TERMS', 'AI_PROCESSING']);
      const ticket = await uploadFile(
        file,
        {
          filename: file.name,
          size: file.size,
          content_type: file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          media_type: 'RESUME',
        },
        setUploadProgress,
      );
      for (let i = 0; i < 80; i++) {
        const resume = await api.resume(ticket.resume_id!);
        if (resume.parse_status === 'READY') {
          setResumeId(resume.id);
          setFileName(file.name);
          return;
        }
        if (resume.parse_status === 'FAILED') throw new Error('简历解析失败，请重试或不使用简历继续');
        await wait(1500);
      }
      throw new Error('简历解析超时，可移除简历继续');
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
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
      const ready = await readyJob(cachedJob.current!.id);
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
              岗位名称<span className="required">*</span>
              <button type="button" className="job-picker-trigger" onClick={() => setJobPickerOpen(true)}>
                <BriefcaseBusiness size={17} />
                <span>{job.job_title || '搜索并选择目标岗位'}</span>
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
            ) : fileName ? (
              <div className="uploaded-file">
                <Paperclip size={20} />
                <div>
                  <strong>{fileName}</strong>
                  <small>解析完成，已准备好关联面试</small>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="移除简历"
                  onClick={() => {
                    setResumeId('');
                    setFileName('');
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <label className="upload-area">
                <Upload size={23} />
                <strong>{uploading ? `正在上传并解析 ${uploadProgress}%` : '点击上传你的简历'}</strong>
                <span>
                  PDF 或 DOCX · 最大 10 MB · 仅用于本次面试训练
                </span>
                <input
                  aria-label="上传个人简历"
                  type="file"
                  accept=".pdf,.docx"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = '';
                  }}
                />
              </label>
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
              <label className="field">
                主问题数量
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={config.question_count}
                  onChange={(e) => changeConfig('question_count', Number(e.target.value))}
                />
              </label>
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
                <dt>主问题数量</dt>
                <dd>{config.question_count} 道</dd>
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
        <div className="job-picker-backdrop" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setJobPickerOpen(false);
        }}>
          <section className="job-picker-modal" role="dialog" aria-modal="true" aria-labelledby="job-picker-title">
            <header>
              <div><span>选择你的方向</span><h2 id="job-picker-title">选择目标岗位</h2></div>
              <button className="icon-btn" type="button" aria-label="关闭" onClick={() => setJobPickerOpen(false)}><X size={19} /></button>
            </header>
            <label className="job-picker-search"><Search size={17} /><input autoFocus value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} placeholder="搜索岗位名称或职责关键词" /></label>
            <div className="job-picker-tree">
              <nav aria-label="一级行业"><button type="button" className={jobCategory === 'ALL' ? 'selected' : ''} onClick={() => { setJobCategory('ALL'); setJobMiddle(''); }}>全部行业</button>{majorOptions.map(([code, name]) => <button type="button" key={code} className={jobCategory === code ? 'selected' : ''} onClick={() => { setJobCategory(code); setJobMiddle(''); }}>{name || occupationCategories[code] || `行业 ${code}`}</button>)}</nav>
              <nav aria-label="二级岗位类目">{middleOptions.map(([code, name]) => <button type="button" key={code} className={jobMiddle === code ? 'selected' : ''} onClick={() => setJobMiddle(code)}>{name}</button>)}</nav>
            <div className="job-picker-results">
              {selectedOccupations.length > 0 && <div className="job-picker-selected">已选 {selectedOccupations.length}/3：{selectedOccupations.map((item) => <button type="button" key={item.sn} onClick={() => toggleOccupation(item)}>{item.name} ×</button>)}</div>}
              {savedJobOptions.map((item) => (
                <button type="button" className="job-picker-option" key={`saved-${item.id}`} onClick={() => chooseJob(item)}>
                  <span className="job-picker-icon"><BriefcaseBusiness size={18} /></span>
                  <span><strong>{item.job_title}</strong><small>{item.jd_text.slice(0, 110) || '选择后可补充岗位 JD'}</small></span>
                  <span className="job-picker-seniority">我的岗位</span>
                </button>
              ))}
              {leafOptions.map((item) => (
                <button type="button" className={`job-picker-option ${selectedOccupations.some((selected) => selected.sn === item.sn) ? 'selected' : ''}`} key={`occupation-${item.sn}`} onClick={() => toggleOccupation(item)}>
                  <span className="job-picker-icon"><BriefcaseBusiness size={18} /></span>
                  <span><strong>{item.name}</strong><small>{item.desc?.slice(0, 110) || '职业分类目录岗位，可补充目标公司的具体 JD'}</small></span>
                  <span className="job-picker-seniority">{occupationCategories[item.sn.split('-')[0]] ?? '职业目录'}</span>
                </button>
              ))}
              {!savedJobOptions.length && !leafOptions.length && <div className="job-picker-empty">{occupationCatalog.isLoading ? '正在加载全行业职业目录…' : occupationCatalog.isError ? <>职业目录暂时加载失败，<button type="button" className="job-picker-retry" onClick={() => void occupationCatalog.refetch()}>点击重试</button>或使用自定义岗位。</> : '没有匹配的岗位，可以使用自定义岗位。'}</div>}
              </div>
            </div>
            <footer><span>职业名称参考《中华人民共和国职业分类大典（2022年版）》</span><button type="button" className="btn primary" onClick={confirmOccupations} disabled={!selectedOccupations.length}>确认选择</button><button type="button" className="btn secondary" onClick={() => {
              setJob((current) => ({ ...current, job_title: current.job_title || jobSearch.trim() }));
              cachedJob.current = null;
              setJobPickerOpen(false);
            }}>使用自定义岗位</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
