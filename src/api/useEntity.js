import { useQueryClient } from '@tanstack/react-query';
import { useTable } from './useTable';

export function useEntity(name, api) {
  const qc = useQueryClient();
  const rows = useTable([name], api.list);
  const invalidate = () => qc.invalidateQueries({ queryKey: [name] });
  return {
    rows,
    create: async (data) => { const r = await api.create(data); await invalidate(); return r; },
    update: async (id, patch) => { const r = await api.update(id, patch); await invalidate(); return r; },
    remove: async (id) => { await api.remove(id); await invalidate(); },
    invalidate,
  };
}
