import { useQuery } from '@tanstack/react-query';

export function useTable(key, queryFn) {
  const queryKey = Array.isArray(key) ? key : [key];
  const { data } = useQuery({ queryKey, queryFn, staleTime: 30_000 });
  return data ?? [];
}
