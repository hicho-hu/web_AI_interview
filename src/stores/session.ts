import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '../types/domain';

interface Session {
  token: string | null;
  user: User | null;
  mode: 'live' | 'demo';
  login: (token: string, user: User, mode: 'live' | 'demo') => void;
  setUser: (user: User) => void;
  clear: () => void;
}
export const useSession = create<Session>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      mode: 'live',
      login: (token, user, mode) => set({ token, user, mode }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null, mode: 'live' }),
    }),
    { name: 'interview-session', storage: createJSONStorage(() => sessionStorage) },
  ),
);
