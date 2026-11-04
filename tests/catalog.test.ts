import { expect, it } from 'vitest';
import { groupProducts, productCategory } from '../src/features/billing/catalog';
import type { Product } from '../src/types/domain';

const product = (code: string, kind: Product['kind']): Product => ({
  code,
  kind,
  name: code,
  amount_minor: 100,
  credits: 1,
  currency: 'CNY',
});

it('groups published packages as single, monthly, quarterly, yearly, then other bundles', () => {
  const grouped = groupProducts([
    product('BUNDLE', 'PACK'),
    product('ANNUAL', 'YEAR'),
    product('QUARTERLY', 'QUARTER'),
    product('MONTHLY_CARD', 'MONTH'),
    product('ONE', 'SINGLE'),
  ]);
  expect(grouped.map((group) => group.label)).toEqual(['次卡', '月卡', '季卡', '年卡', '组合套餐']);
  expect(grouped.map((group) => group.items[0].code)).toEqual([
    'ONE',
    'MONTHLY_CARD',
    'QUARTERLY',
    'ANNUAL',
    'BUNDLE',
  ]);
});

it('keeps legacy catalog entries in the one-time or bundle category', () => {
  expect(productCategory(product('SINGLE', undefined))).toBe('SINGLE');
  expect(productCategory(product('MONTHLY', undefined))).toBe('MONTH');
  expect(productCategory(product('PACK_10', undefined))).toBe('PACK');
});
