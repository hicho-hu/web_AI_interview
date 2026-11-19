import type { Membership } from '../../types/domain';

export interface PracticeRules {
  version: number;
  enabled: boolean;
  free_question_limit: number;
  interview_reward: number;
  max_rounds: number;
  vip_all_questions: boolean;
  voice_enabled: boolean;
}
export interface PracticeQuota {
  membership: Membership;
  rules: PracticeRules;
  unlimited: boolean;
  base_limit: number;
  reward_unlocks: number;
  unlocked_count: number;
  remaining_unlocks: number;
}
export interface Company {
  id: string;
  code: string;
  name: string;
  logo_url?: string | null;
  industry: string;
  description: string;
  question_count: number;
}
export interface Position {
  code: string;
  name: string;
}
export interface CompanyQuestion {
  id: string;
  question_text: string;
  question_type: string;
  skills_json: string[];
  position_codes_json: string[];
  attribution: string;
  source_url: string;
  license_type: string;
  association_type: string;
  unlocked: boolean;
  masked: boolean;
}
export interface PracticeRound {
  round_no: number;
  question: string;
  answer: string | null;
  mode?: 'TEXT' | 'VOICE';
  answer_evidence?: string;
}
export interface PracticeReport {
  overall_score: number | null;
  dimensions: {
    name: string;
    score: number | null;
    feedback: string;
    evidence: string[];
  }[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  reference_approach: string;
  disclaimer: string;
}
export interface PracticeSession {
  id: string;
  question_id: string;
  company_id: string;
  position_code: string | null;
  status: 'IN_PROGRESS' | 'FINISHING' | 'REPORT_FAILED' | 'COMPLETED';
  report_task: {
    id: string;
    status: string;
    retry_count: number;
    error_code: string | null;
  } | null;
  max_rounds: number;
  voice_enabled: boolean;
  created_at: string;
  completed_at: string | null;
  question: {
    question_text: string;
    attribution: string;
    source_url: string;
    license_type: string;
  };
  company: { name: string; code: string };
  rounds: PracticeRound[];
  report: PracticeReport | null;
}

export interface PracticeExplanationResult {
  status:
    | 'NOT_REQUESTED'
    | 'PENDING'
    | 'QUEUED'
    | 'RUNNING'
    | 'RETRYING'
    | 'FAILED'
    | 'CANCELLED'
    | 'SUCCEEDED'
    | 'READY';
  task_id: string | null;
  explanation: {
    overview: string;
    disclaimer: string;
    generated_at: string;
    items: {
      round_no: number;
      question: string;
      answer: string;
      key_points: string[];
      common_mistakes: string[];
    }[];
  } | null;
}
