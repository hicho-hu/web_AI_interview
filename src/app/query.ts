import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/client';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        count < 2 && (!(error instanceof ApiError) || !error.status || error.status >= 500),
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
if (typeof window !== 'undefined') window.addEventListener('session-expired', () => queryClient.clear());
