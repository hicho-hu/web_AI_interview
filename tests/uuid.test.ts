import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from '../src/utils/uuid';
import { completeOperation, operationKey } from '../src/services/client';

afterEach(() => vi.unstubAllGlobals());

it('公网 HTTP 缺少 randomUUID 时仍生成独立的 v4 UUID 并保持重试幂等键', () => {
  const original = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
  const ids = Array.from({ length: 32 }, () => randomUUID());
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const key = operationKey('http-registration');
  expect(operationKey('http-registration')).toBe(key);
  completeOperation('http-registration');
  expect(operationKey('http-registration')).not.toBe(key);
  completeOperation('http-registration');
});
