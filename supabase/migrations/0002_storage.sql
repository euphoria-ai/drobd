-- Cutout storage.
--
-- Private bucket. Objects are addressed as '<user_id>/<item_id>.png' and the
-- policies below enforce that prefix, so a user can neither read nor write
-- outside their own folder even with a valid session token.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cutouts', 'cutouts', false, 8388608, array['image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


create policy "read own cutouts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cutouts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "upload own cutouts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cutouts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "replace own cutouts" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cutouts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "delete own cutouts" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cutouts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
