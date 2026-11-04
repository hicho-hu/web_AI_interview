import { z } from 'zod';
import { useSession } from '../stores/session';
import type {
  ConsentKind,
  Consents,
  Interview,
  InterviewInput,
  Job,
  JobInput,
  LoginResult,
  Page,
  ReportResult,
  Resume,
  MediaAsset,
  Task,
  Turn,
  UploadInput,
  UploadTicket,
  OSSCredentials,
  User,
  ProductCatalog,
  BillingOrder,
  Entitlements,
  UsageRecord,
} from '../types/domain';
import { request } from './client';
import { mock } from './mock';
import { recordingStore } from '../features/media/recordingStore';
import { erasePurchaseAttempts } from '../features/billing/purchase';

const demo = () => useSession.getState().mode === 'demo';
const userSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  status: z.string(),
  remaining_interviews: z.number(),
  universal_interviews: z.number().optional(),
  interview_credits: z.object({ TEXT: z.number(), VOICE: z.number(), VIDEO: z.number() }).optional(),
  created_at: z.string(),
  email: z.string().nullable().optional(),
  has_password: z.boolean().optional(),
  avatar_url: z.string().nullable().optional(),
  system_avatar_key: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  phone_verified: z.boolean().optional(),
});
async function allPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await request<Page<T>>('GET', `${path}${separator}page=${page}&page_size=100`);
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
  }
}
export const devLoginEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_LOGIN !== 'false';
export const api = {
  sendEmailCode: (email: string, purpose: 'REGISTER' | 'RESET_PASSWORD' = 'REGISTER', binding = false) =>
    request<{
      challenge_id: string;
      expires_in: number;
      resend_after: number;
      delivery: string;
      development_code?: string;
    }>('POST', binding ? '/users/me/email-code' : '/auth/email-code', {
      email,
      ...(!binding ? { purpose } : {}),
    }),
  emailLogin: (email: string, password: string) =>
    request<LoginResult>('POST', '/auth/email-login', { email, password }),
  emailRegister: (input: {
    email: string;
    password: string;
    nickname: string;
    code: string;
    challenge_id: string;
    agreed: true;
    invite_code?: string;
    promotion_code?: string;
  }) => request<LoginResult>('POST', '/auth/email-register', input),
  resetPassword: (input: { email: string; code: string; challenge_id: string; new_password: string }) =>
    request<LoginResult>('POST', '/auth/password-reset', input),
  bindEmail: (input: {
    email: string;
    code: string;
    challenge_id: string;
    current_password?: string;
    new_password?: string;
  }) => request<LoginResult>('POST', '/users/me/email', input),
  changePassword: (current_password: string, new_password: string) =>
    request<LoginResult>('POST', '/users/me/password', { current_password, new_password }),
  updateAvatar: (asset_id: string) => request<User>('PATCH', '/users/me/avatar', { asset_id }),
  updateSystemAvatar: (system_avatar_key: string) =>
    request<User>('PATCH', '/users/me/avatar', { system_avatar_key }),
  updateContact: (phone: string) => request<User>('PATCH', '/users/me/contact', { phone }),
  invitation: () =>
    request<{
      code: string;
      url: string;
      valid_invites: number;
      current_rule_invites: number;
      reward_count: number;
      next_reward_in: number;
      rules: {
        enabled: boolean;
        threshold: number;
        inviter_rewards: import('../types/domain').ModeCredits;
        invitee_rewards: import('../types/domain').ModeCredits;
      };
      reward_records?: UsageRecord[];
      recent: { id: string; registered_at: string; status: string; email?: string | null; nickname?: string | null; avatar_asset_id?: string | null; system_avatar_key?: string | null; avatar_url?: string | null }[];
    }>('GET', '/invitations/me'),
  async login(identity: string, nickname: string) {
    if (!devLoginEnabled) throw new Error('当前环境不提供开发登录');
    const result = await request<LoginResult>('POST', '/auth/dev-login', { identity, nickname });
    return { ...result, user: userSchema.parse(result.user) };
  },
  demoLogin: () => ({ access_token: 'local-demo', user: mock.user(), expires_in: 3600 }),
  me: async () => (demo() ? mock.user() : userSchema.parse(await request<User>('GET', '/users/me'))),
  products: async () => (demo() ? mock.products() : request<ProductCatalog>('GET', '/billing/products')),
  entitlements: async () =>
    demo() ? mock.entitlements() : request<Entitlements>('GET', '/billing/entitlements'),
  rewardUsage: async () =>
    demo()
      ? ([] as UsageRecord[])
      : allPages<UsageRecord>('/billing/usage?usage_type=INVITER_REWARD&usage_type=INVITEE_REWARD'),
  orders: async (page = 1) =>
    demo() ? mock.orders() : request<Page<BillingOrder>>('GET', `/billing/orders?page=${page}&page_size=10`),
  order: async (id: string) =>
    demo() ? mock.order(id) : request<BillingOrder>('GET', `/billing/orders/${id}`),
  createOrder: async (productCode: string, key: string) =>
    demo()
      ? mock.createOrder(productCode, key)
      : request<BillingOrder>('POST', '/billing/orders', { product_code: productCode }, key),
  mockPay: async (id: string, key: string) =>
    demo() ? mock.mockPay(id) : request<BillingOrder>('POST', `/billing/orders/${id}/dev-pay`, {}, key),
  updateMe: async (nickname: string) =>
    demo() ? mock.updateUser(nickname) : request<User>('PATCH', '/users/me', { nickname }),
  logout: async () => {
    if (!demo()) await request('POST', '/auth/logout');
  },
  consents: async () => (demo() ? mock.consents() : request<Consents>('GET', '/users/me/consents')),
  consent: async (kind: ConsentKind, policy_version: string) =>
    demo()
      ? mock.consent(kind)
      : request('POST', '/users/me/consents', { consent_type: kind, policy_version }),
  revoke: async (kind: ConsentKind) =>
    demo() ? mock.revoke(kind) : request('DELETE', `/users/me/consents/${kind}`),
  async ensureConsents(kinds: ConsentKind[]) {
    const current = await this.consents();
    const active = current.items
      .filter((c) => !c.revoked_at && c.policy_version === current.policy_version)
      .map((c) => c.consent_type);
    for (const kind of kinds) if (!active.includes(kind)) await this.consent(kind, current.policy_version);
  },
  jobs: async () => (demo() ? mock.jobs() : request<Page<Job>>('GET', '/job-profiles?page_size=100')),
  createJob: async (input: JobInput) =>
    demo() ? mock.createJob(input) : request<Job>('POST', '/job-profiles', input),
  job: async (id: string) => (demo() ? mock.job(id) : request<Job>('GET', `/job-profiles/${id}`)),
  create: async (input: InterviewInput, key: string) =>
    demo()
      ? mock.create(input)
      : request<{ interview_id: string; status: string; task_id: string | null }>(
          'POST',
          '/interviews',
          input,
          key,
        ),
  async history(
    page = 1,
    filters: { status?: string; job_profile_id?: string; from_time?: string; to_time?: string } = {},
  ) {
    if (demo()) return mock.history();
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return request<Page<Interview>>('GET', `/interviews?${params}`);
  },
  async allHistory(): Promise<Interview[]> {
    if (demo()) return mock.history().items;
    return allPages<Interview>('/interviews');
  },
  detail: async (id: string) => (demo() ? mock.detail(id) : request<Interview>('GET', `/interviews/${id}`)),
  turns: async (id: string) =>
    demo() ? mock.turns(id) : request<{ items: Turn[] }>('GET', `/interviews/${id}/turns`),
  action: async (id: string, action: string, key?: string, body: unknown = {}) =>
    demo() ? mock.action(id, action) : request<unknown>('POST', `/interviews/${id}/${action}`, body, key),
  submit: async (
    id: string,
    turnId: string,
    body: { text?: string; asset_id?: string; client_duration_ms?: number },
    key: string,
  ) =>
    demo()
      ? mock.submit(id, turnId, body.text || '')
      : request<{ task_id: string; processing_status: string }>(
          'POST',
          `/interviews/${id}/turns/${turnId}/submit`,
          body,
          key,
        ),
  report: async (id: string) =>
    demo() ? mock.report(id) : request<ReportResult>('GET', `/interviews/${id}/report`),
  deleteInterview: async (id: string) => {
    const userId = useSession.getState().user?.id;
    const result = demo() ? mock.delete(id) : await request('DELETE', `/interviews/${id}`);
    if (userId) await recordingStore.erase(userId, id);
    return result;
  },
  task: async (id: string) =>
    demo() ? ({ id, status: 'COMPLETED', error_code: null } as Task) : request<Task>('GET', `/tasks/${id}`),
  retryTask: async (id: string) => request('POST', `/tasks/${id}/retry`),
  resumes: async () =>
    demo()
      ? ({ items: [], total: 0, page: 1, page_size: 20 } as Page<Resume>)
      : request<Page<Resume>>('GET', '/resumes?page_size=100'),
  allJobs: async () => (demo() ? mock.jobs().items : allPages<Job>('/job-profiles')),
  allResumes: async () => (demo() ? ([] as Resume[]) : allPages<Resume>('/resumes')),
  resume: async (id: string) => request<Resume>('GET', `/resumes/${id}`),
  deleteResume: async (id: string) => request('DELETE', `/resumes/${id}`),
  uploadTicket: async (input: UploadInput) =>
    request<UploadTicket>(
      'POST',
      input.media_type === 'RESUME' ? '/resumes/upload-url' : '/media/upload-url',
      input,
    ),
  ossCredentials: (id: string) =>
    request<OSSCredentials>('GET', `/storage/sts-token?asset_id=${encodeURIComponent(id)}`),
  completeUpload: async (id: string, etag?: string) =>
    request('POST', `/media/${id}/complete`, etag ? { etag } : {}),
  media: async (id: string) => request<MediaAsset>('GET', `/media/${id}`),
  sessionMedia: async (interviewId: string) => {
    if (demo()) return [] as MediaAsset[];
    const items: MediaAsset[] = [];
    for (let page = 1; ; page++) {
      const result = await request<Page<MediaAsset>>(
        'GET',
        `/media?interview_id=${encodeURIComponent(interviewId)}&page=${page}&page_size=100`,
      );
      items.push(...result.items);
      if (items.length >= result.total || result.items.length === 0) break;
    }
    return items.filter((item) =>
      ['SESSION_AUDIO', 'SESSION_VIDEO', 'SESSION_CAPTIONS'].includes(item.media_type),
    );
  },
  exportData: async () =>
    demo()
      ? { user: mock.user(), jobs: mock.jobs(), interviews: mock.history(), consents: mock.consents() }
      : request<unknown>('GET', '/users/me/data'),
  eraseData: async () => {
    const userId = useSession.getState().user?.id;
    const result = demo() ? mock.erase() : await request('DELETE', '/users/me/data');
    if (userId) {
      erasePurchaseAttempts(userId);
      await recordingStore.erase(userId);
    }
    return result;
  },
};
