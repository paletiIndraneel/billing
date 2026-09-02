import { supabase } from '../lib/supabase';

export { supabase };

export function cid() {
  const id = localStorage.getItem('lekhya_company_id');
  if (!id) throw new Error('No company selected');
  return id;
}

export const newId = () => crypto.randomUUID();

export const q = (table) => supabase.from(table);

export async function rows(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function one(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data;
}
