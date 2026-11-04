import type { ProductCatalog } from '../../types/domain';

export const demoCatalog: ProductCatalog = {
  payment_enabled: false,
  development_mock_payment: true,
  items: [
    {
      code: 'SINGLE',
      kind: 'SINGLE',
      name: '单次文字训练',
      amount_minor: 990,
      credits: 1,
      interview_credits: { TEXT: 1, VOICE: 0, VIDEO: 0 },
      currency: 'CNY',
    },
    {
      code: 'STARTER',
      kind: 'PACK',
      name: '多模式体验套餐',
      amount_minor: 3990,
      credits: 6,
      interview_credits: { TEXT: 3, VOICE: 2, VIDEO: 1 },
      currency: 'CNY',
    },
    {
      code: 'PACK_10',
      kind: 'PACK',
      name: '10 次组合训练套餐',
      amount_minor: 6900,
      credits: 10,
      interview_credits: { TEXT: 5, VOICE: 3, VIDEO: 2 },
      currency: 'CNY',
    },
    {
      code: 'MONTHLY',
      kind: 'PACK',
      name: '20 次组合训练套餐',
      amount_minor: 9900,
      credits: 20,
      interview_credits: { TEXT: 10, VOICE: 6, VIDEO: 4 },
      currency: 'CNY',
    },
  ],
};
