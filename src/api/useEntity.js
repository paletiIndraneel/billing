import { useQueryClient } from '@tanstack/react-query';
import { useTable } from './useTable';
import { useLoading } from '../components/LoadingOverlay';

export function useEntity(name, api) {
  const qc = useQueryClient();
  const { withLoading } = useLoading();
  const rows = useTable([name], api.list);
  const invalidate = () => qc.invalidateQueries({ queryKey: [name] });
  return {
    rows,
    create: async (data) => withLoading(async () => { const r = await api.create(data); await invalidate(); return r; }),
    update: async (id, patch) => withLoading(async () => { const r = await api.update(id, patch); await invalidate(); return r; }),
    remove: async (id) => withLoading(async () => { await api.remove(id); await invalidate(); }),
    invalidate,
  };
}
