import type { User } from '../types/domain';

export const userStorageKey = (user?: User | null) => user?.storage_owner_key || user?.id || '';
