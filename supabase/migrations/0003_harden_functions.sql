-- Function hardening, from the security advisor.
--
-- Every function here is a trigger. Triggers fire with the row context Postgres
-- supplies; none is meant to be invoked directly. But a SECURITY DEFINER
-- function in the public schema is exposed at /rest/v1/rpc/<name> and runs as
-- its owner, so leaving EXECUTE open lets a client call it out of context. The
-- fix is a pinned search_path (so the definer can't be tricked into resolving
-- an object from another schema) plus revoking EXECUTE from the API roles.

-- Pin the one function that was missing it. The others already set it.
create or replace function touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke from PUBLIC, not just anon/authenticated: Postgres grants EXECUTE to
-- PUBLIC by default when a function is created, and both API roles inherit it.
-- Revoking from the named roles alone leaves that default grant in place.
revoke execute on function public.touch_updated_at() from public;
revoke execute on function public.sync_item_wear_stats() from public;
revoke execute on function public.handle_new_user() from public;
