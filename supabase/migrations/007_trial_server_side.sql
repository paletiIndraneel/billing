-- Server-side trial tracking: trial_started_at lives on companies (owner-only
-- RLS), so a SECURITY DEFINER RPC is the only way for any company member
-- (not just the owner) to read/set it. Idempotent: only sets it once.
begin;

alter table companies add column if not exists trial_started_at timestamptz;

create or replace function ensure_trial_started(p_company_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
begin
  if not exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = auth.uid() and active
  ) then
    raise exception 'Not authorized for this company';
  end if;

  update companies set trial_started_at = now()
  where id = p_company_id and trial_started_at is null
  returning trial_started_at into v_started;

  if v_started is null then
    select trial_started_at into v_started from companies where id = p_company_id;
  end if;

  return v_started;
end;
$$;

grant execute on function ensure_trial_started(uuid) to authenticated;

commit;
