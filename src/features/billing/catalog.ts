import type { Product } from '../../types/domain';

const categoryOrder = ['SINGLE', 'MONTH', 'QUARTER', 'YEAR', 'PACK'] as const;
export const categoryLabels: Record<(typeof categoryOrder)[number], string> = {
  SINGLE: '次卡',
  MONTH: '月卡',
  QUARTER: '季卡',
  YEAR: '年卡',
  PACK: '组合套餐',
};

export function productCategory(product: Product) {
  if (product.kind && categoryOrder.includes(product.kind)) return product.kind;
  if (product.code === 'SINGLE') return 'SINGLE';
  if (product.code === 'MONTHLY') return 'MONTH';
  return 'PACK';
}

export function groupProducts(products: Product[]) {
  return categoryOrder
    .map((kind) => ({
      kind,
      label: categoryLabels[kind],
      items: products.filter((product) => productCategory(product) === kind),
    }))
    .filter((group) => group.items.length > 0);
}
