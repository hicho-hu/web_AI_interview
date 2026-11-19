import { request } from './client';
import type { Page, MediaAsset } from '../types/domain';
import type {
  Company,
  CompanyQuestion,
  Position,
  PracticeQuota,
  PracticeSession,
  PracticeExplanationResult,
} from '../features/questions/types';

const aiOptions = { timeout: 180000 };
export const practiceApi = {
  companies: (position_code: string) =>
    request<Company[]>(
      'GET',
      `/question-practice/companies?${new URLSearchParams({ position_code })}`,
    ),
  positions: () => request<Position[]>('GET', '/question-bank/positions'),
  quota: () => request<PracticeQuota>('GET', '/question-practice/entitlements'),
  questions: (company: string, position: string, page: number) =>
    request<
      Page<CompanyQuestion> & {
        entitlements: PracticeQuota;
        trial_company_id: string | null;
        trial_question_limit: number;
      }
    >(
      'GET',
      `/question-practice/companies/${company}/questions?${new URLSearchParams({ position_code: position, page: String(page), page_size: '15' })}`,
    ),
  start: (
    company_id: string,
    question_id: string,
    position_code: string,
    key: string,
    restart = false,
  ) =>
    request<PracticeSession>(
      'POST',
      '/question-practice/sessions',
      { company_id, question_id, position_code, restart },
      key,
    ),
  session: (id: string) =>
    request<PracticeSession>('GET', `/question-practice/sessions/${id}`),
  history: (page: number) =>
    request<Page<PracticeSession>>(
      'GET',
      `/question-practice/sessions?page=${page}&page_size=10`,
    ),
  answer: (
    id: string,
    body: {
      round_no: number;
      text: string;
      mode: 'TEXT' | 'VOICE';
      asset_id?: string;
      end_session?: boolean;
    },
    key: string,
  ) =>
    request<PracticeSession>(
      'POST',
      `/question-practice/sessions/${id}/answers`,
      body,
      key,
      aiOptions,
    ),
  explanation: (id: string) =>
    request<PracticeExplanationResult>(
      'GET',
      `/question-practice/sessions/${id}/explanation`,
    ),
  requestExplanation: (id: string, key: string) =>
    request<PracticeExplanationResult>(
      'POST',
      `/question-practice/sessions/${id}/explanation`,
      {},
      key,
    ),
  questionAudio: (id: string, round: number, signal?: AbortSignal) =>
    request<MediaAsset>(
      'POST',
      `/question-practice/sessions/${id}/rounds/${round}/audio`,
      {},
      undefined,
      { timeout: 60000, signal },
    ),
  transcribe: (id: string, round_no: number, asset_id: string, key: string) =>
    request<{ text: string }>(
      'POST',
      `/question-practice/sessions/${id}/transcriptions`,
      { round_no, asset_id },
      key,
      aiOptions,
    ),
  finish: (id: string, key: string) =>
    request<PracticeSession>(
      'POST',
      `/question-practice/sessions/${id}/finish`,
      {},
      key,
      aiOptions,
    ),
  retryReport: (id: string, key: string) =>
    request<PracticeSession>(
      'POST',
      `/question-practice/sessions/${id}/report/retry`,
      {},
      key,
    ),
  regenerateReport: (id: string, key: string) =>
    request<PracticeSession>(
      'POST',
      `/question-practice/sessions/${id}/report/regenerate`,
      {},
      key,
    ),
};
