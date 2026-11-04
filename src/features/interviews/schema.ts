import { z } from 'zod';
export const jobSchema = z.object({
  job_title: z.string().trim().min(1, '请输入目标岗位名称').max(120, '岗位名称最多 120 字'),
  jd_text: z.string().trim().min(1, '请粘贴岗位职责和任职要求').max(30000, 'JD 最多 30,000 字'),
  seniority: z.enum(['JUNIOR', 'MIDDLE', 'SENIOR', 'EXPERT']),
});
export const configSchema = z.object({
  mode: z.enum(['TEXT', 'VOICE', 'VIDEO']),
  duration_minutes: z.union([z.literal(15), z.literal(30), z.literal(45)]),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  question_count: z.number().int().min(1).max(20),
  language: z.enum(['zh-CN', 'en-US']),
  allow_follow_up: z.boolean(),
  max_follow_ups: z.number().int().min(0).max(3),
  max_clarifications: z.number().int().min(0).max(3),
  interview_type: z.enum(['COMPREHENSIVE', 'TECHNICAL', 'BEHAVIORAL']),
});
export const defaultConfig = configSchema.parse({
  mode: 'TEXT',
  duration_minutes: 15,
  difficulty: 'MEDIUM',
  question_count: 5,
  language: 'zh-CN',
  allow_follow_up: true,
  max_follow_ups: 1,
  max_clarifications: 2,
  interview_type: 'COMPREHENSIVE',
});
