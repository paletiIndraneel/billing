import { useQuery } from '@tanstack/react-query';

export function useTable(key, queryFn, fallback = []) {
  const queryKey = Array.isArray(key) ? key : [key];
  const { data, error } = useQuery({ queryKey, queryFn, staleTime: 30_000 });
  if (error) throw error;   // caught by the nearest per-route <ErrorBoundary>
  return data ?? fallback;
}
