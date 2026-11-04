import type {
  Config,
  ConsentKind,
  Consents,
  Interview,
  InterviewInput,
  Job,
  JobInput,
  Page,
  Report,
  Turn,
  User,
  BillingOrder,
  Mode,
} from '../types/domain';
import { ApiError } from './client';
import { defaultConfig } from '../features/interviews/schema';
import { demoCatalog } from '../features/billing/demoCatalog';
import { availableCredits, creditLabels, creditModes, emptyCredits } from '../features/billing/credits';

const names = ['岗位相关性', '结构逻辑', '专业深度', '案例证据', '问题解决', '表达清晰度'];
interface DemoData {
  user: User;
  jobs: Job[];
  interviews: Interview[];
  turns: Record<string, Turn[]>;
  reports: Record<string, Report>;
  clocks: Record<string, { elapsed: number; runningSince: number | null }>;
  consents: Consents;
  orders: BillingOrder[];
  orderKeys: Record<string, string>;
  reservations: Record<string, { source: Mode | 'UNIVERSAL'; status: 'RESERVED' | 'CONSUMED' | 'RELEASED' }>;
}
const storageKey = 'interview-demo-v1';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function question(title: string, jd: string, index: number, en: boolean) {
  const requirement =
    jd.split(/[。；\n]/).filter(Boolean)[index % jd.split(/[。；\n]/).filter(Boolean).length] || title;
  return en
    ? `For the ${title} role, describe a specific example related to “${requirement}”. What did you do and what was the result?`
    : [
        `请结合一段真实经历，介绍你与${title}岗位最相关的经验。针对“${requirement}”，你做过哪些具体工作？`,
        `围绕“${requirement}”，分享一次你解决复杂问题的经历。你如何分析问题、权衡方案并验证结果？`,
        `如果入职${title}岗位，面对“${requirement}”这项要求，你会如何制定前 30 天的行动计划？`,
        `请举例说明在“${requirement}”相关项目中，你如何与团队协作、处理分歧并推动落地。`,
        `回顾与“${requirement}”有关的一次挑战，你最大的收获是什么？如果重新来过，你会如何改进？`,
      ][index % 5];
}
function makeTurn(item: Interview, index: number, job: Job): Turn {
  return {
    id: id(),
    turn_no: index + 1,
    main_index: index,
    parent_turn_id: null,
    turn_type: 'MAIN',
    competency: names[index % names.length],
    question: question(job.job_title, job.jd_text, index, item.config.language === 'en-US'),
    transcript: null,
    status: 'WAITING_ANSWER',
    task_id: null,
    question_audio: null,
    answer_media: null,
  };
}
function createReport(_item: Interview, turns: Turn[]): Report {
  const answered = turns.filter((t) => t.transcript);
  return {
    id: id(),
    version: 1,
    overall_score: null,
    job_match_feedback: '这是本地演示报告。问题依据你输入的岗位内容构造，未调用真实模型，不对实际能力评分。',
    dimensions: names.map((name) => ({
      name,
      score: null,
      feedback: '演示模式无法判断真实能力，请连接后端 AI 服务获取基于回答证据的评价。',
      evidence: [],
    })),
    reviews: answered.map((t) => ({
      turn_id: t.id,
      summary: t.transcript!.slice(0, 100),
      strengths: ['已完成本轮回答，内容已保存在演示记录中。'],
      weaknesses: ['演示模式不评判实际能力。'],
      suggestions: ['可以使用 STAR 结构补充背景、目标、个人行动与可验证的结果。'],
      reference_approach:
        '先交代问题背景，再说明你的职责与选择，最后用可验证的结果说明价值；只使用真实经历。',
      evidence: [t.transcript!.slice(0, 60)],
    })),
    strengths: [],
    gaps: ['真实能力和岗位匹配程度在演示模式下无法判断。'],
    recommendations: ['复盘回答是否包含个人行动与结果。', '围绕目标 JD 准备 2–3 段真实项目经历。'],
    practice_questions: ['选择一个最有代表性的项目，按 STAR 结构重新回答。'],
    disclaimer: '仅用于演示流程；不代表实际能力、招聘方评价或录用概率。',
    is_mock: true,
    model: 'local-demo',
    original_turns: answered.map((t) => ({ turn_id: t.id, question: t.question, answer: t.transcript! })),
    created_at: now(),
  };
}
function fresh(): DemoData {
  return {
    user: {
      id: 'demo-user',
      nickname: '体验用户',
      status: 'ACTIVE',
      remaining_interviews: 99,
      universal_interviews: 99,
      interview_credits: emptyCredits(),
      created_at: now(),
    },
    jobs: [],
    interviews: [],
    turns: {},
    reports: {},
    clocks: {},
    consents: { policy_version: '1.0', items: [] },
    orders: [],
    orderKeys: {},
    reservations: {},
  };
}
function read(): DemoData {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || 'null') as DemoData | null;
    if (!data) return fresh();
    data.user.universal_interviews ??= data.user.remaining_interviews;
    data.user.interview_credits ??= emptyCredits();
    return {
      ...data,
      clocks: data.clocks || {},
      orders: data.orders || [],
      orderKeys: data.orderKeys || {},
      reservations: data.reservations || {},
    };
  } catch {
    return fresh();
  }
}
function save(data: DemoData) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}
function paged<T>(items: T[]): Page<T> {
  return { items, total: items.length, page: 1, page_size: 100 };
}
function elapsed(db: DemoData, item: Interview) {
  const clock = db.clocks[item.id];
  return clock
    ? clock.elapsed + (clock.runningSince === null ? 0 : (Date.now() - clock.runningSince) / 1000)
    : item.elapsed_seconds;
}
function stopClock(db: DemoData, item: Interview) {
  const seconds = elapsed(db, item);
  db.clocks[item.id] = { elapsed: seconds, runningSince: null };
  item.elapsed_seconds = seconds;
}
export const mock = {
  user: () => read().user,
  products: () => structuredClone(demoCatalog),
  entitlements: () => {
    const db = read(),
      reserved = emptyCredits();
    for (const [itemId, reservation] of Object.entries(db.reservations)) {
      const item = db.interviews.find((item) => item.id === itemId);
      if (reservation.status === 'RESERVED' && item) reserved[item.mode]++;
    }
    return {
      remaining_interviews: db.user.remaining_interviews,
      universal_interviews: db.user.universal_interviews,
      interview_credits: db.user.interview_credits,
      reserved_interviews: Object.values(reserved).reduce((sum, count) => sum + count, 0),
      reserved_by_mode: reserved,
    };
  },
  orders: () => paged(read().orders),
  order(orderId: string) {
    const order = read().orders.find((item) => item.id === orderId);
    if (!order) throw new ApiError('订单不存在', 'RESOURCE_NOT_FOUND', undefined, 404);
    return order;
  },
  createOrder(productCode: string, key: string) {
    const db = read();
    if (db.orderKeys[key]) {
      const existing = db.orders.find((order) => order.id === db.orderKeys[key])!;
      if (existing.product_code !== productCode)
        throw new ApiError('幂等键已用于不同请求', 'IDEMPOTENCY_CONFLICT', undefined, 409);
      return existing;
    }
    const product = demoCatalog.items.find((item) => item.code === productCode);
    if (!product) throw new ApiError('套餐不存在', 'PRODUCT_NOT_FOUND', undefined, 404);
    const order: BillingOrder = {
      id: id(),
      product_code: product.code,
      amount_minor: product.amount_minor,
      credits: product.credits,
      interview_credits: product.interview_credits ? { ...product.interview_credits } : null,
      currency: product.currency,
      status: 'PENDING',
      paid_at: null,
      refunded_at: null,
    };
    db.orders.unshift(order);
    db.orderKeys[key] = order.id;
    save(db);
    return order;
  },
  mockPay(orderId: string) {
    const db = read();
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw new ApiError('订单不存在', 'RESOURCE_NOT_FOUND', undefined, 404);
    if (!['PENDING', 'PAID'].includes(order.status))
      throw new ApiError('订单不可支付', 'BILLING_INVALID_STATE', undefined, 409);
    if (order.status === 'PENDING') {
      order.status = 'PAID';
      order.paid_at = now();
      db.user.remaining_interviews += order.credits;
      if (order.interview_credits) {
        for (const mode of creditModes) db.user.interview_credits![mode] += order.interview_credits[mode];
      } else db.user.universal_interviews! += order.credits;
      save(db);
    }
    return order;
  },
  updateUser(nickname: string) {
    const db = read();
    db.user.nickname = nickname;
    save(db);
    return db.user;
  },
  consents: () => read().consents,
  consent(kind: ConsentKind) {
    const db = read();
    db.consents.items.push({
      id: id(),
      consent_type: kind,
      policy_version: '1.0',
      consented_at: now(),
      revoked_at: null,
    });
    save(db);
  },
  revoke(kind: ConsentKind) {
    const db = read();
    db.consents.items
      .filter((c) => c.consent_type === kind)
      .forEach((c) => {
        c.revoked_at = now();
      });
    save(db);
  },
  jobs: () => paged(read().jobs),
  createJob(input: JobInput) {
    const db = read();
    const job: Job = { ...input, id: id(), status: 'READY', task_id: null, created_at: now() };
    db.jobs.unshift(job);
    save(db);
    return job;
  },
  job(jobId: string) {
    const job = read().jobs.find((j) => j.id === jobId);
    if (!job) throw new ApiError('岗位不存在', 'NOT_FOUND');
    return job;
  },
  create(input: InterviewInput) {
    const db = read();
    if (availableCredits(db.user, input.config.mode) < 1)
      throw new ApiError(
        `${creditLabels[input.config.mode]}面试次数不足`,
        'INTERVIEW_QUOTA_NOT_ENOUGH',
        undefined,
        403,
      );
    const source = db.user.interview_credits![input.config.mode] > 0 ? input.config.mode : 'UNIVERSAL';
    const job = this.job(input.job_profile_id);
    const item: Interview = {
      id: id(),
      job_profile_id: job.id,
      job_title: job.job_title,
      resume_asset_id: null,
      mode: input.config.mode,
      config: input.config || defaultConfig,
      status: 'READY',
      current_turn_no: 1,
      elapsed_seconds: 0,
      created_at: now(),
      started_at: null,
      ended_at: null,
      overall_score: null,
      current_question: null,
      prepare_task_id: null,
      report_task_id: null,
      failure_code: null,
      version: 1,
    };
    const turn = makeTurn(item, 0, job);
    if (source === 'UNIVERSAL') db.user.universal_interviews!--;
    else db.user.interview_credits![source]--;
    db.user.remaining_interviews--;
    db.reservations[item.id] = { source, status: 'RESERVED' };
    item.current_question = turn;
    db.interviews.unshift(item);
    db.turns[item.id] = [turn];
    db.clocks[item.id] = { elapsed: 0, runningSince: null };
    save(db);
    return { interview_id: item.id, status: item.status, task_id: null };
  },
  history: () => {
    const db = read();
    return paged(db.interviews.map((item) => ({ ...item, elapsed_seconds: elapsed(db, item) })));
  },
  detail(itemId: string) {
    const db = read();
    const item = db.interviews.find((i) => i.id === itemId);
    if (!item) throw new ApiError('面试记录不存在', 'NOT_FOUND', undefined, 404);
    return { ...item, elapsed_seconds: elapsed(db, item) };
  },
  turns: (itemId: string) => ({ items: read().turns[itemId] || [] }),
  action(itemId: string, action: string) {
    const db = read();
    const item = db.interviews.find((i) => i.id === itemId)!;
    stopClock(db, item);
    if (action === 'finish' || action === 'report/regenerate') {
      item.status = 'COMPLETED';
      item.ended_at = now();
      const previous = db.reports[itemId]?.version || 0;
      db.reports[itemId] = createReport(item, db.turns[itemId]);
      db.reports[itemId].version = previous + 1;
    } else if (action === 'pause') item.status = 'PAUSED';
    else if (action === 'cancel') {
      item.status = 'CANCELLED';
      const reservation = db.reservations[itemId];
      if (reservation?.status === 'RESERVED') {
        reservation.status = 'RELEASED';
        if (reservation.source === 'UNIVERSAL') db.user.universal_interviews!++;
        else db.user.interview_credits![reservation.source]++;
        db.user.remaining_interviews++;
      }
    } else {
      if (db.reservations[itemId]?.status === 'RESERVED') db.reservations[itemId].status = 'CONSUMED';
      item.status = 'IN_PROGRESS';
      item.started_at ||= now();
      db.clocks[item.id].runningSince = Date.now();
    }
    save(db);
    return item;
  },
  submit(itemId: string, turnId: string, text: string) {
    const db = read();
    const item = db.interviews.find((i) => i.id === itemId)!;
    const turns = db.turns[itemId];
    const turn = turns.find((t) => t.id === turnId)!;
    if (turn.status !== 'WAITING_ANSWER') throw new ApiError('该题已经提交', 'INTERVIEW_ALREADY_SUBMITTED');
    turn.transcript = text;
    turn.status = 'COMPLETED';
    const followup =
      item.config.allow_follow_up &&
      item.config.max_follow_ups > 0 &&
      turn.turn_type === 'MAIN' &&
      text.length < 100;
    let next: Turn | null = null;
    if (followup)
      next = {
        ...makeTurn(item, turn.main_index, this.job(item.job_profile_id)),
        id: id(),
        turn_no: turns.length + 1,
        turn_type: 'FOLLOW_UP',
        parent_turn_id: turn.id,
        question:
          item.config.language === 'en-US'
            ? 'Could you add your specific actions and measurable results?'
            : '你提到的这段经历中，你个人采取了哪些具体行动？能否补充一个可验证的结果？',
      };
    else if (turn.main_index + 1 < item.config.question_count)
      next = {
        ...makeTurn(item, turn.main_index + 1, this.job(item.job_profile_id)),
        turn_no: turns.length + 1,
      };
    if (next) {
      turns.push(next);
      item.current_question = next;
      item.current_turn_no = next.turn_no;
    } else {
      stopClock(db, item);
      item.status = 'COMPLETED';
      item.ended_at = now();
      item.current_question = turn;
      db.reports[itemId] = createReport(item, turns);
    }
    save(db);
    return { task_id: 'demo-complete', processing_status: 'COMPLETED' };
  },
  report: (itemId: string) => ({
    status: mock.detail(itemId).status,
    report: read().reports[itemId] || null,
  }),
  delete(itemId: string) {
    const db = read();
    db.interviews = db.interviews.filter((i) => i.id !== itemId);
    delete db.turns[itemId];
    delete db.reports[itemId];
    delete db.clocks[itemId];
    save(db);
  },
  erase() {
    localStorage.removeItem(storageKey);
  },
};
export type { Config };
