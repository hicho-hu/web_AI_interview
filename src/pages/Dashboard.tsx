import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Lightbulb,
  MessageSquare,
  Mic,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Video,
} from 'lucide-react';
import { api } from '../services/api';
import { useSession } from '../stores/session';
import { Empty, ErrorState, InterviewRows, Loading, PageHeading } from '../components/common/ui';
const TrendChart = lazy(() => import('../components/charts/Charts').then((m) => ({ default: m.TrendChart })));

export default function Dashboard() {
  const user = useSession((s) => s.user);
  const history = useQuery({ queryKey: ['history-all'], queryFn: api.allHistory });
  const items = history.data || [];
  const finished = items.filter((i) => i.status === 'COMPLETED');
  const scores = finished.filter((i) => i.overall_score !== null);
  const average = scores.length
    ? Math.round(scores.reduce((sum, i) => sum + i.overall_score!, 0) / scores.length)
    : null;
  const minutes = Math.round(items.reduce((sum, i) => sum + i.elapsed_seconds, 0) / 60);
  const stats = [
    {
      label: '累计模拟面试',
      value: items.length,
      unit: '场',
      caption: '每一次开口，都是积累',
      icon: MessageSquare,
      color: 'blue',
    },
    {
      label: '平均综合评分',
      value: average ?? '—',
      unit: '分',
      caption: scores.length ? `基于 ${scores.length} 份有效评分报告` : '完成首场面试后解锁',
      icon: Trophy,
      color: 'orange',
    },
    {
      label: '累计练习时长',
      value: minutes,
      unit: '分钟',
      caption: '把准备，变成你的底气',
      icon: Clock3,
      color: 'purple',
    },
    {
      label: '已完成的面试',
      value: finished.length,
      unit: '场',
      caption: '复盘让每一次练习更有价值',
      icon: TrendingUp,
      color: 'green',
    },
  ];
  return (
    <div className="dashboard">
      <PageHeading
        eyebrow="LET’S MAKE PROGRESS"
        title={`${user?.nickname || '你好'}，准备好更进一步了吗？`}
        description="每一次认真练习，都在为下一次机会积蓄底气。"
      >
        <span className="today">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </span>
      </PageHeading>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-tag">
            <span />
            你的下一次精彩回答，从这里开始
          </span>
          <h2>
            让面试的每一步，
            <br />
            都更有把握。
          </h2>
          <p>
            还原真实面试场景，围绕目标岗位深入提问。
            <br className="desktop-break" />让 AI 陪你练习，用专业反馈看见进步。
          </p>
          <Link className="btn primary hero-button" to="/interviews/new">
            <Plus size={18} />
            开始模拟面试
            <ArrowRight size={17} />
          </Link>
          <div className="hero-benefits">
            <span>
              <Check size={13} />
              岗位定制
            </span>
            <span>
              <Check size={13} />
              动态追问
            </span>
            <span>
              <Check size={13} />
              多维度复盘
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-orbit orbit-a" />
          <div className="art-orbit orbit-b" />
          <div className="art-spark spark-a">✦</div>
          <div className="art-spark spark-b">✧</div>
          <div className="art-chat art-chat-one">
            <span className="art-mini-icon">
              <Sparkles size={15} />
            </span>
            <div>
              <b>AI 面试官</b>
              <span>聊聊你最有成就感的项目？</span>
            </div>
            <i />
          </div>
          <div className="art-core">
            <div className="art-core-inner">
              <AudioLines size={60} strokeWidth={1.5} />
            </div>
          </div>
          <div className="art-chat art-chat-two">
            <span className="art-check">
              <Check size={17} />
            </span>
            <div>
              <b>每一次练习，都有收获</b>
              <div className="art-wave">
                {[6, 13, 9, 20, 14, 25, 18, 12, 22, 16, 8, 14, 10, 5].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </div>
            </div>
          </div>
          <div className="art-dot dot-one" />
          <div className="art-dot dot-two" />
        </div>
      </section>
      <section className="stats-grid" aria-label="练习统计">
        {stats.map(({ label, value, unit, caption, icon: Icon, color }) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {history.isPending ? '—' : value}
              <small>{unit}</small>
            </div>
            <p>{caption}</p>
          </div>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>最近的面试</h2>
              <p>回顾每一次表达，发现下一步的方向</p>
            </div>
            <Link className="text-link" to="/history">
              查看全部
              <ArrowRight size={15} />
            </Link>
          </div>
          {history.isPending ? (
            <Loading />
          ) : history.isError ? (
            <ErrorState error={history.error} retry={() => void history.refetch()} />
          ) : items.length ? (
            <InterviewRows items={items.slice(0, 4)} />
          ) : (
            <Empty />
          )}
        </section>
        <aside className="panel tips-panel">
          <div className="tips-heading">
            <span>
              <Lightbulb size={18} />
            </span>
            <h2>让练习更有效</h2>
            <span className="mini-label">面试锦囊</span>
          </div>
          <div className="tip-body">
            <span className="tip-number">01 / PREPARATION</span>
            <h3>
              用 STAR 法则，
              <br />
              讲好你的项目故事。
            </h3>
            <p>
              从背景、任务、行动到结果，
              <br />
              让经历有结构，让价值被看见。
            </p>
            <div className="star-steps">
              {[
                ['S', '背景'],
                ['T', '任务'],
                ['A', '行动'],
                ['R', '结果'],
              ].map(([letter, word]) => (
                <div key={letter}>
                  <b>{letter}</b>
                  <small>{word}</small>
                </div>
              ))}
            </div>
          </div>
          <Link to="/interviews/new" className="tips-link">
            带着真实经历，试着回答
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
      <div className="dashboard-lower">
        <section className="panel growth-panel">
          <div className="panel-heading">
            <div>
              <h2>看见你的成长</h2>
              <p>持续练习，把进步变成一条看得见的曲线</p>
            </div>
            <span className="chart-legend">
              <i />
              综合评分
            </span>
          </div>
          <Suspense fallback={<Loading />}>
            <TrendChart items={items} />
          </Suspense>
        </section>
        <section className="panel steps-panel">
          <div className="panel-heading">
            <div>
              <h2>三步，开启你的下一章</h2>
              <p>从有准备，到有把握</p>
            </div>
            <Target size={20} className="muted" />
          </div>
          {[
            { icon: FileText, title: '告诉我们你的目标', text: '粘贴岗位 JD，可选上传个人简历' },
            { icon: Mic, title: '和 AI 认真聊一场', text: '文字、语音或视频，按你的节奏练习' },
            { icon: ArrowDownToLine, title: '把反馈变成下一步', text: '复盘回答，找到值得强化的能力' },
          ].map(({ icon: Icon, title, text }, i) => (
            <div className="guide-step" key={title}>
              <span>
                <Icon size={18} />
              </span>
              <div>
                <strong>
                  <small>0{i + 1}</small>
                  {title}
                </strong>
                <p>{text}</p>
              </div>
              {i < 2 && <ChevronRight size={15} />}
            </div>
          ))}
          <div className="supported-modes">
            <span>
              <MessageSquare size={13} />
              文字
            </span>
            <span>
              <Mic size={13} />
              语音
            </span>
            <span>
              <Video size={13} />
              视频
            </span>
            <span className="muted">选择适合你的练习方式</span>
          </div>
        </section>
      </div>
    </div>
  );
}
