-- drobe core schema.
--
-- The app talks to Postgres directly from the device, so RLS is the only thing
-- standing between one user's wardrobe and another's. Every table gets it in
-- this migration rather than a later one -- there is no window in which a table
-- exists unprotected.

create type item_category as enum (
  'Tops', 'Bottoms', 'Outerwear', 'Footwear',
  'Accessories', 'Bags', 'Electronics', 'Others'
);

-- Where an item sits in a daily outfit. 'none' is for things that are owned but
-- not worn (electronics, household objects); they show in Inventory and never
-- in the outfit carousels.
create type item_slot as enum (
  'top', 'bottom', 'outerwear', 'footwear', 'accessory', 'none'
);

create type outfit_source as enum ('ai', 'manual');


create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at  timestamptz not null default now()
);


create table items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,

  name           text not null default 'item',
  category       item_category not null default 'Others',
  slot           item_slot not null default 'none',

  quantity       integer not null default 1 check (quantity > 0),
  location       text,
  note           text,

  -- Path within the `cutouts` storage bucket, always '<user_id>/<item_id>.png'.
  image_path     text,
  -- Kept so the pile can size a physics body before its texture has loaded;
  -- without these the layout jumps as images stream in.
  width_px       integer,
  height_px      integer,

  dominant_color text,
  ai_confidence  real,

  -- Denormalised from wear_log by trigger. The Home dashboard and the stylist
  -- both read these per item, and recomputing an aggregate each time would
  -- make the dashboard scale with history rather than wardrobe size.
  times_worn     integer not null default 0,
  last_worn_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Soft delete: outfits worn in the past should keep rendering even after the
  -- user gets rid of the garment.
  archived_at    timestamptz
);

create index items_user_recent_idx on items (user_id, created_at desc) where archived_at is null;
create index items_user_slot_idx on items (user_id, slot) where archived_at is null;
create index items_user_category_idx on items (user_id, category) where archived_at is null;


create table outfits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text,
  -- The day this outfit is for. Null means a saved look not tied to a date.
  for_date   date,
  source     outfit_source not null default 'manual',
  created_at timestamptz not null default now()
);

-- One outfit per calendar day. The week strip assumes this; two rows for the
-- same date would make the day's thumbnail nondeterministic.
create unique index outfits_one_per_day_idx
  on outfits (user_id, for_date)
  where for_date is not null;


create table outfit_items (
  outfit_id uuid not null references outfits on delete cascade,
  item_id   uuid not null references items on delete cascade,
  slot      item_slot not null,
  position  integer not null default 0,
  primary key (outfit_id, slot)  -- at most one item per slot per outfit
);

create index outfit_items_item_idx on outfit_items (item_id);


create table wear_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  item_id   uuid not null references items on delete cascade,
  outfit_id uuid references outfits on delete set null,
  worn_on   date not null default current_date,
  created_at timestamptz not null default now()
);

-- Wearing the same item twice in one day shouldn't double its count.
create unique index wear_log_once_per_day_idx on wear_log (user_id, item_id, worn_on);
create index wear_log_user_date_idx on wear_log (user_id, worn_on desc);


-- Keep items.times_worn / last_worn_at in step with wear_log in both
-- directions, so undoing a "wore this" leaves the stats correct.
create or replace function sync_item_wear_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update items
       set times_worn = times_worn + 1,
           last_worn_at = greatest(coalesce(last_worn_at, 'epoch'::timestamptz), new.worn_on::timestamptz),
           updated_at = now()
     where id = new.item_id;
    return new;
  else
    update items
       set times_worn = greatest(0, times_worn - 1),
           last_worn_at = (
             select max(worn_on)::timestamptz from wear_log where item_id = old.item_id
           ),
           updated_at = now()
     where id = old.item_id;
    return old;
  end if;
end;
$$;

create trigger wear_log_sync_stats
  after insert or delete on wear_log
  for each row execute function sync_item_wear_stats();


create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_touch_updated_at
  before update on items
  for each row execute function touch_updated_at();


-- Give every new user a profile row, including anonymous ones. The app signs in
-- anonymously on first launch, so this is the normal path, not an edge case.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- Row level security -------------------------------------------------------

alter table profiles     enable row level security;
alter table items        enable row level security;
alter table outfits      enable row level security;
alter table outfit_items enable row level security;
alter table wear_log     enable row level security;

create policy "own profile" on profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own items" on items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own outfits" on outfits
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own wear log" on wear_log
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- outfit_items has no user_id of its own; ownership is inherited from the
-- parent outfit so there is exactly one place that defines who owns a look.
create policy "own outfit items" on outfit_items
  for all
  using (exists (
    select 1 from outfits o
     where o.id = outfit_items.outfit_id and o.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from outfits o
     where o.id = outfit_items.outfit_id and o.user_id = (select auth.uid())
  ));
