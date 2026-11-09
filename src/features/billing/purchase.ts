import { randomUUID } from '../../utils/uuid';

export interface PurchaseAttempt {
  key: string;
  productCode: string;
  orderId?: string;
}
const attempts = new Map<string, PurchaseAttempt>();
const storageKey = (userId: string, productCode: string) => `interview-purchase:${userId}:${productCode}`;

// Preserve the creation key across a timeout, closing checkout, and a page reload.
// An uncertain response must not turn the next click into a second purchase.
function savedAttempt(userId: string, productCode: string) {
  const key = storageKey(userId, productCode);
  let current = attempts.get(key);
  if (!current) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as PurchaseAttempt | null;
      if (
        typeof stored?.key === 'string' &&
        stored.key.length > 0 &&
        stored.key.length <= 120 &&
        stored.productCode === productCode &&
        (stored.orderId === undefined || typeof stored.orderId === 'string')
      )
        current = stored;
    } catch {
      /* Session storage may be unavailable. Keep the in-memory attempt. */
    }
  }
  return current;
}
export function purchaseAttempt(userId: string, productCode: string): PurchaseAttempt {
  const current = savedAttempt(userId, productCode) || { key: randomUUID(), productCode };
  rememberPurchase(userId, current);
  return current;
}
export function rememberPurchase(userId: string, attempt: PurchaseAttempt) {
  const key = storageKey(userId, attempt.productCode);
  attempts.set(key, attempt);
  try {
    sessionStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    /* The order remains retryable. */
  }
}
export function completePurchase(userId: string, order: { id: string; product_code: string }) {
  const key = storageKey(userId, order.product_code);
  const current = savedAttempt(userId, order.product_code);
  if (current?.orderId !== order.id) return;
  attempts.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* The server still prevents a duplicate grant. */
  }
}
export function erasePurchaseAttempts(userId: string) {
  const prefix = `interview-purchase:${userId}:`;
  for (const key of attempts.keys()) if (key.startsWith(prefix)) attempts.delete(key);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage may be unavailable. In-memory attempts have been erased. */
  }
}
export const money = (amountMinor: number, currency = 'CNY') =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amountMinor / 100);
