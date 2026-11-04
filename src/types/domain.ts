export type Mode = 'TEXT' | 'VOICE' | 'VIDEO';
export type ModeCredits = Record<Mode, number>;
export type InterviewStatus =
  | 'DRAFT'
  | 'PREPARING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'FAILED'
  | 'FINISHING'
  | 'REPORT_FAILED'
  | 'COMPLETED'
  | 'CANCELLED';
export interface User {
  id: string;
  nickname: string;
  status: string;
  remaining_interviews: number;
  universal_interviews?: number;
  interview_credits?: ModeCredits;
  created_at: string;
  email?: string | null;
  has_password?: boolean;
  avatar_url?: string | null;
  system_avatar_key?: string | null;
  contact_phone?: string | null;
  phone_verified?: boolean;
}
export interface Product {
  code: string;
  kind?: 'SINGLE' | 'MONTH' | 'QUARTER' | 'YEAR' | 'PACK';
  name: string;
  amount_minor: number;
  credits: number;
  interview_credits?: ModeCredits | null;
  currency: string;
  version?: number;
}
export interface ProductCatalog {
  items: Product[];
  payment_enabled: boolean;
  development_mock_payment: boolean;
}
export interface Entitlements {
  remaining_interviews: number;
  reserved_interviews: number;
  universal_interviews?: number;
  interview_credits?: ModeCredits;
  reserved_by_mode?: ModeCredits;
}
export interface UsageRecord {
  id: string;
  interview_id?: string | null;
  usage_type: string;
  quantity: number;
  credit_allocations: Partial<ModeCredits> & { UNIVERSAL?: number };
  status: string;
  amount_minor?: number;
  created_at: string;
}
export interface BillingOrder {
  id: string;
  product_code: string;
  amount_minor: number;
  credits: number;
  interview_credits?: ModeCredits | null;
  currency: string;
  status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED';
  paid_at: string | null;
  refunded_at: string | null;
}
export interface LoginResult {
  access_token: string;
  user: User;
  expires_in: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
export interface Config {
  mode: Mode;
  duration_minutes: 15 | 30 | 45;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  question_count: number;
  language: 'zh-CN' | 'en-US';
  allow_follow_up: boolean;
  max_follow_ups: number;
  max_clarifications: number;
  interview_type: 'COMPREHENSIVE' | 'TECHNICAL' | 'BEHAVIORAL';
}
export interface JobInput {
  job_title: string;
  jd_text: string;
  seniority: 'JUNIOR' | 'MIDDLE' | 'SENIOR' | 'EXPERT';
}
export interface Job extends JobInput {
  id: string;
  status: string;
  task_id: string | null;
  created_at: string;
  structure?: { required_skills: string[]; competencies: string[] };
}
export interface MediaAsset {
  id: string;
  media_type: string;
  status: string;
  download_url: string | null;
  content_type: string;
  duration_ms: number | null;
}
export interface Turn {
  id: string;
  turn_no: number;
  main_index: number;
  parent_turn_id: string | null;
  turn_type: string;
  competency: string;
  question: string;
  transcript: string | null;
  status: string;
  task_id: string | null;
  question_audio: MediaAsset | null;
  answer_media: MediaAsset | null;
  decision?: { decision?: string; reason?: string } | null;
}
export interface Interview {
  conversation_features?: { streaming_answers: boolean; live_transcription?: boolean };
  id: string;
  job_profile_id: string;
  job_title: string;
  resume_asset_id: string | null;
  status: InterviewStatus;
  mode: Mode;
  config: Config;
  current_turn_no: number;
  elapsed_seconds: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  overall_score: number | null;
  current_question: Turn | null;
  prepare_task_id: string | null;
  report_task_id: string | null;
  failure_code: string | null;
  version: number;
  plan?: { questions?: { question: string; competency: string }[] } | null;
}
export interface Dimension {
  name: string;
  score: number | null;
  feedback: string;
  evidence: string[];
}
export interface Review {
  turn_id: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  reference_approach: string;
  evidence: string[];
}
export interface Report {
  id: string;
  version: number;
  overall_score: number | null;
  job_match_feedback: string;
  dimensions: Dimension[];
  reviews: Review[];
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  practice_questions: string[];
  disclaimer: string;
  is_mock: boolean;
  model: string;
  original_turns: { turn_id: string; question: string; answer: string }[];
  created_at: string;
}
export interface ReportResult {
  status: InterviewStatus;
  task_id?: string;
  report: Report | null;
}
export interface Task {
  id: string;
  status: string;
  error_code: string | null;
  result?: unknown;
}
export interface Resume {
  id: string;
  asset_id: string;
  parse_status: string;
  task_id: string | null;
  summary?: { summary: string };
  created_at: string;
}
export type ConsentKind = 'PRIVACY' | 'TERMS' | 'AI_PROCESSING' | 'MICROPHONE' | 'CAMERA' | 'SCREEN_CAPTURE';
export interface Consent {
  id: string;
  consent_type: ConsentKind;
  policy_version: string;
  consented_at: string;
  revoked_at: string | null;
}
export interface Consents {
  policy_version: string;
  items: Consent[];
}
export interface UploadInput {
  filename: string;
  content_type: string;
  size: number;
  media_type:
    'AUDIO' | 'VIDEO' | 'RESUME' | 'AVATAR' | 'SESSION_AUDIO' | 'SESSION_VIDEO' | 'SESSION_CAPTIONS';
  interview_id?: string;
  turn_id?: string;
  duration_ms?: number;
}
export interface UploadTicket {
  asset_id: string;
  resume_id?: string;
  upload_url: string;
  method: string;
  headers: Record<string, string>;
  expires_in: number;
  storage_backend?: 'oss';
  object_key?: string;
}
export interface OSSCredentials {
  asset_id: string;
  access_key_id: string;
  access_key_secret: string;
  security_token: string;
  expiration: string;
  bucket: string;
  endpoint: string;
  region: string;
  object_key: string;
  prefix: string;
}
export interface InterviewInput {
  job_profile_id: string;
  resume_asset_id?: string;
  config: Config;
}
