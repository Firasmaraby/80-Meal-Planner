-- =============================================================================
-- Eighty: initial schema
--
-- Layout
--   0. extensions
--   1. tables (catalog -> plans -> user data)
--   2. functions + triggers
--   3. row level security (RLS is enabled on EVERY table)
--   4. grants
--   5. RPCs
--
-- Conventions
--   * Every SECURITY DEFINER function sets `search_path = ''` and uses fully
--     qualified names (public.*, auth.*, pg_catalog.*).
--   * `updated_at` is ALWAYS server time (trigger). It is the pull cursor for
--     sync. Tables that sync from offline clients also carry
--     `client_updated_at` (client clock) which is used for last-write-wins
--     conflict resolution (see public.lww_guard).
--   * Soft-deleted rows (deleted_at) are kept so deletes propagate to other
--     devices. Purge old tombstones with a scheduled job if the table grows.
--   * Plan versions are immutable once published (see guard_plan_content), so
--     enrollments pinned to (plan_id, version) never change under a user.
--
-- Written for Supabase (schemas `auth` and `extensions`, roles `anon` and
-- `authenticated` already exist).
-- =============================================================================

begin;

-- 0. extensions -----------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- 1. tables ----------------------------------------------------------------------

-- 1a. catalog: foods ---------------------------------------------------------------
create table public.foods (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 300),
  category    text not null check (category in (
                'fruit','vegetable','legume','grain','nut_seed','dairy','egg','meat',
                'poultry','fish','oil_fat','beverage','condiment','sweet','prepared','other')),
  aliases     text[] not null default '{}',
  tags        text[] not null default '{}',
  gi          numeric check (gi is null or (gi >= 0 and gi <= 150)),
  servings    jsonb not null default '[]'::jsonb check (jsonb_typeof(servings) = 'array'),
  -- per 100 g, keyed by NutrientKey. Missing key / null = "no data" (never 0).
  nutrients   jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  -- [{ "db": "USDA FDC SR Legacy", "ref": "09148" }, ...]
  sources     jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  rare        boolean not null default false,
  rank        integer not null default 0 check (rank between 0 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 'custom:' is reserved for user-owned foods so food_logs.food_id (which has
  -- no FK, because it may point at either table) is never ambiguous.
  constraint foods_id_not_custom check (id not like 'custom:%')
);
comment on table public.foods is 'Shared food catalog, per 100 g edible portion. Bundled in the app too; this copy lets the catalog be updated.';

create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);
create index foods_updated_at_idx on public.foods (updated_at);

-- 1b. catalog: swap groups ---------------------------------------------------------
-- food_ids is an array (mirrors SwapGroup.foodIds); Postgres cannot enforce an FK
-- on array elements, so the pipeline that seeds this table must emit valid ids.
create table public.swap_groups (
  key         text primary key check (char_length(key) between 1 and 100),
  label       text not null check (char_length(label) between 1 and 200),
  food_ids    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 1c. profiles ---------------------------------------------------------------------
-- Created by trigger on auth.users insert, so sex/age/height/weight are nullable
-- until onboarding is finished.
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  name              text check (name is null or char_length(name) between 1 and 100),
  sex               text check (sex in ('male','female')),
  age               integer check (age between 1 and 120),
  height_cm         numeric check (height_cm between 50 and 260),
  weight_kg         numeric check (weight_kg between 10 and 500),
  activity          text not null default 'light'
                      check (activity in ('sedentary','light','moderate','very','athlete')),
  goal              text not null default 'maintain' check (goal in ('lose','maintain','gain')),
  life_stage        text not null default 'none' check (life_stage in ('none','pregnant','lactating')),
  protein_per_kg    numeric not null default 1.6 check (protein_per_kg between 0.1 and 4),
  sat_fat_pct       numeric not null default 10 check (sat_fat_pct between 0 and 100),
  size_to_me        boolean not null default true,   -- scale plan portions to the person's calories
  dislikes          text[] not null default '{}' check (cardinality(dislikes) <= 200),  -- food ids or 'cat:<category>'
  diet              text[] not null default '{}',
  is_admin          boolean not null default false,
  -- 'epoch' on purpose: the blank row made at sign-up must lose to ANY real client write
  -- (e.g. a profile filled in offline before the account existed).
  client_updated_at timestamptz not null default 'epoch',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_life_stage_needs_female check (life_stage = 'none' or sex = 'female')
);
comment on column public.profiles.is_admin is 'Only settable from the SQL editor / service role. Clients are blocked by RLS and a trigger.';

-- 1d. meal plans -------------------------------------------------------------------
create table public.meal_plans (
  id            text not null check (char_length(id) between 1 and 100),
  version       integer not null check (version >= 1),
  name          text not null check (char_length(name) between 1 and 200),
  band_min      integer not null check (band_min > 0),
  band_max      integer not null,
  cuisine       text not null default '',
  tags          text[] not null default '{}',
  description   text,
  author        text,
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  published_at  timestamptz,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (id, version),
  constraint meal_plans_band_order check (band_min < band_max),
  constraint meal_plans_published_has_date check (status <> 'published' or published_at is not null)
);
-- at most ONE published version per plan id
create unique index meal_plans_one_published_idx on public.meal_plans (id) where status = 'published';
create index meal_plans_status_idx on public.meal_plans (status);

create table public.plan_meals (
  plan_id        text not null,
  version        integer not null,
  day            integer not null check (day >= 1),
  slot           text not null check (slot in ('breakfast','lunch','dinner','snack')),
  position       integer not null check (position >= 0),  -- order within the day
  meal_id        text not null check (char_length(meal_id) between 1 and 100),
  name           text not null check (char_length(name) between 1 and 200),
  prep_minutes   integer check (prep_minutes is null or prep_minutes >= 0),
  instructions   text,
  photo_url      text,
  -- meal_id is unique within a plan version (logs reference plan_id + meal_id)
  primary key (plan_id, version, meal_id),
  unique (plan_id, version, day, position),
  foreign key (plan_id, version) references public.meal_plans (id, version)
    on update cascade on delete cascade
);

create table public.plan_ingredients (
  plan_id     text not null,
  version     integer not null,
  meal_id     text not null,
  position    integer not null check (position >= 0),
  food_id     text not null references public.foods (id) on update cascade on delete restrict,
  grams       numeric not null check (grams > 0 and grams <= 100000),
  swap_group  text references public.swap_groups (key) on update cascade on delete restrict,
  note        text,
  primary key (plan_id, version, meal_id, position),
  foreign key (plan_id, version, meal_id) references public.plan_meals (plan_id, version, meal_id)
    on update cascade on delete cascade
);
create index plan_ingredients_food_idx on public.plan_ingredients (food_id);
create index plan_ingredients_swap_group_idx on public.plan_ingredients (swap_group) where swap_group is not null;

-- 1e. user data --------------------------------------------------------------------
create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan_id     text not null,
  version     integer not null,
  started_on  date not null default current_date,
  "current"   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- RESTRICT: a version somebody is enrolled in can never be deleted.
  foreign key (plan_id, version) references public.meal_plans (id, version)
    on update cascade on delete restrict
);
create unique index enrollments_one_current_idx on public.enrollments (user_id) where "current";
create index enrollments_user_idx on public.enrollments (user_id, updated_at);
create index enrollments_plan_idx on public.enrollments (plan_id, version);

create table public.food_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  client_id          text not null check (char_length(client_id) between 1 and 128),
  date               date not null,                       -- local calendar day of the user
  "at"               timestamptz not null,
  -- no FK: may reference public.foods.id OR public.custom_foods.id ('custom:...')
  food_id            text not null check (char_length(food_id) between 1 and 200),
  grams              numeric not null check (grams > 0 and grams <= 100000),
  plan_id            text,
  plan_version       integer,
  meal_id            text,
  slot               text check (slot in ('breakfast','lunch','dinner','snack')),
  client_updated_at  timestamptz not null default now(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- idempotent offline sync: upsert on (user_id, client_id)
  constraint food_logs_user_client_uniq unique (user_id, client_id)
);
create index food_logs_user_date_idx on public.food_logs (user_id, date);
create index food_logs_user_updated_idx on public.food_logs (user_id, updated_at);

create table public.custom_foods (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null check (id like 'custom:%' and char_length(id) <= 200),
  name        text not null check (char_length(name) between 1 and 300),
  category    text not null check (category in (
                'fruit','vegetable','legume','grain','nut_seed','dairy','egg','meat',
                'poultry','fish','oil_fat','beverage','condiment','sweet','prepared','other')),
  aliases     text[] not null default '{}',
  tags        text[] not null default '{}',
  gi          numeric check (gi is null or (gi >= 0 and gi <= 150)),
  servings    jsonb not null default '[]'::jsonb check (jsonb_typeof(servings) = 'array'),
  nutrients   jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  sources     jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  rare        boolean not null default false,
  rank        integer not null default 0 check (rank between 0 and 100),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index custom_foods_user_updated_idx on public.custom_foods (user_id, updated_at);

-- Shape check for ingredient arrays stored as jsonb: [{ foodId, grams, swapGroup?, note? }].
-- Mirrors the client `Ingredient` type. Immutable + pure, so it is usable in CHECK constraints.
-- (CASE guards the numeric cast: SQL does not promise AND short-circuiting.)
create function public.is_valid_ingredients(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or pg_catalog.jsonb_typeof(p) <> 'array' then false
    when pg_catalog.jsonb_array_length(p) > 100 then false
    else not exists (
      select 1 from pg_catalog.jsonb_array_elements(p) e
      where case
        when pg_catalog.jsonb_typeof(e) <> 'object' then true
        when pg_catalog.jsonb_typeof(e -> 'foodId') is distinct from 'string'
          or pg_catalog.char_length(e ->> 'foodId') not between 1 and 200 then true
        when pg_catalog.jsonb_typeof(e -> 'grams') is distinct from 'number' then true
        when (e ->> 'grams')::numeric <= 0 or (e ->> 'grams')::numeric > 100000 then true
        when e ? 'swapGroup' and pg_catalog.jsonb_typeof(e -> 'swapGroup') not in ('string', 'null') then true
        when e ? 'note' and pg_catalog.jsonb_typeof(e -> 'note') not in ('string', 'null') then true
        else false
      end
    )
  end;
$$;

-- Per-day meal changes: meals added to a day from the meal library ('added', optionally
-- replacing a plan meal) and plan meals removed from a day ('skipped'). Mirrors the client's
-- dayAdds / daySkips. Offline-synced like food_logs: upsert on (user_id, uid), soft delete.
create table public.day_meals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  uid                text not null check (char_length(uid) between 1 and 200),  -- client id; skips use 'skip:<date>:<plan meal id>'
  date               date not null,                       -- local calendar day of the user
  kind               text not null check (kind in ('added','skipped')),
  library_key        text check (library_key is null or char_length(library_key) between 1 and 300),  -- `${planId}~${mealId}`
  -- added: the plan meal this one replaces (null = pure addition); skipped: the plan meal removed
  plan_meal_id       text check (plan_meal_id is null or char_length(plan_meal_id) between 1 and 100),
  slot               text check (slot in ('breakfast','lunch','dinner','snack')),
  name               text check (name is null or char_length(name) between 1 and 200),
  prep_minutes       integer check (prep_minutes is null or prep_minutes >= 0),
  instructions       text,
  -- [{ "foodId": "...", "grams": 120, "swapGroup": "...", "note": "..." }]
  ingredients        jsonb not null default '[]'::jsonb check (public.is_valid_ingredients(ingredients)),
  client_updated_at  timestamptz not null default now(),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- idempotent offline sync: upsert on (user_id, uid)
  constraint day_meals_user_uid_uniq unique (user_id, uid),
  constraint day_meals_added_shape check (
    kind <> 'added'
    or (library_key is not null and slot is not null and name is not null
        and case when pg_catalog.jsonb_typeof(ingredients) = 'array'
                 then pg_catalog.jsonb_array_length(ingredients) > 0 else false end)
  ),
  constraint day_meals_skipped_shape check (kind <> 'skipped' or plan_meal_id is not null)
);
comment on table public.day_meals is 'Meals added to a day from the library (kind=added) and plan meals removed from a day (kind=skipped). Soft-deleted via deleted_at.';
create index day_meals_user_date_idx on public.day_meals (user_id, date);
create index day_meals_user_updated_idx on public.day_meals (user_id, updated_at);

-- Library meals the user starred. Keys are `${planId}~${mealId}`; no FK because the plan
-- version may be archived or the meal may come from a local plan.
create table public.favorite_meals (
  user_id      uuid not null references auth.users (id) on delete cascade,
  library_key  text not null check (char_length(library_key) between 1 and 300),
  created_at   timestamptz not null default now(),
  primary key (user_id, library_key)
);

-- 2. functions + triggers -----------------------------------------------------------

-- 2a. updated_at -------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger foods_touch            before update on public.foods            for each row execute function public.set_updated_at();
create trigger swap_groups_touch      before update on public.swap_groups      for each row execute function public.set_updated_at();
create trigger profiles_touch         before update on public.profiles         for each row execute function public.set_updated_at();
create trigger meal_plans_touch       before update on public.meal_plans       for each row execute function public.set_updated_at();
create trigger enrollments_touch      before update on public.enrollments      for each row execute function public.set_updated_at();
create trigger food_logs_touch        before update on public.food_logs        for each row execute function public.set_updated_at();
create trigger custom_foods_touch     before update on public.custom_foods     for each row execute function public.set_updated_at();
create trigger day_meals_touch        before update on public.day_meals        for each row execute function public.set_updated_at();

-- 2b. last-write-wins for offline-synced tables -------------------------------------
-- Clients upsert with their own `client_updated_at`. A write that is OLDER than what
-- is stored is silently skipped (BEFORE trigger returning NULL), so a stale device
-- that syncs late cannot clobber newer data. Equal timestamps are accepted (a retry
-- of the same write is idempotent). Future-dated clocks are clamped to now()+5min so
-- one bad clock cannot make a row unbeatable.
-- Trigger names sort before `*_touch`, so a skipped row never gets a new updated_at.
create function public.lww_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.client_updated_at := least(new.client_updated_at, pg_catalog.now() + interval '5 minutes');
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger food_logs_lww before insert or update on public.food_logs for each row execute function public.lww_guard();
create trigger profiles_lww  before insert or update on public.profiles  for each row execute function public.lww_guard();
create trigger day_meals_lww before insert or update on public.day_meals for each row execute function public.lww_guard();

-- 2c. is_admin() ---------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- 2c'. is the caller enrolled in this exact plan version? ---------------------------------
-- SECURITY DEFINER on purpose: meal_plans' SELECT policy needs to look at enrollments, and
-- enrollments' INSERT policy looks at meal_plans. Doing both through RLS makes Postgres
-- raise "infinite recursion detected in policy"; this helper breaks the cycle.
create function public.is_enrolled_in_plan(p_id text, p_version integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.user_id = (select auth.uid()) and e.plan_id = p_id and e.version = p_version
  );
$$;

-- 2d. nobody but the SQL editor / service role may set is_admin ------------------------
-- Defence in depth: the RLS policies below also pin is_admin. PostgREST switches to the
-- `anon` / `authenticated` role (SET ROLE), so current_user identifies API callers.
-- SECURITY DEFINER functions owned by postgres and the service role are not affected.
create function public.profiles_protect_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.is_admin then
      raise exception 'is_admin cannot be set by clients' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin cannot be changed by clients' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin before insert or update on public.profiles
  for each row execute function public.profiles_protect_admin();

-- 2e. profile row on signup ----------------------------------------------------------
-- Must never fail (it would block sign-ups): defensive truncation + ON CONFLICT.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 100), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2f. plan versions are immutable once they leave draft ----------------------------------
create function public.guard_plan_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- the version being written (INSERT/UPDATE) ...
  if tg_op in ('INSERT', 'UPDATE') then
    select p.status into v_status from public.meal_plans p
      where p.id = new.plan_id and p.version = new.version;
    if v_status is not null and v_status <> 'draft' then
      raise exception 'plan %@% is % and its content is immutable; upload a new version instead',
        new.plan_id, new.version, v_status using errcode = '55006';
    end if;
  end if;
  -- ... and the version being left (UPDATE/DELETE). When a draft plan is deleted the
  -- parent row is already gone during the cascade, so v_status is null and we allow it.
  if tg_op in ('UPDATE', 'DELETE') then
    select p.status into v_status from public.meal_plans p
      where p.id = old.plan_id and p.version = old.version;
    if v_status is not null and v_status <> 'draft' then
      raise exception 'plan %@% is % and its content is immutable; upload a new version instead',
        old.plan_id, old.version, v_status using errcode = '55006';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger plan_meals_guard before insert or update or delete on public.plan_meals
  for each row execute function public.guard_plan_content();
create trigger plan_ingredients_guard before insert or update or delete on public.plan_ingredients
  for each row execute function public.guard_plan_content();

create function public.guard_meal_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'plan %@% is % and cannot be deleted; archive it instead', old.id, old.version, old.status
        using errcode = '55006';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'plan %@% cannot go back to draft', old.id, old.version using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger meal_plans_guard before update or delete on public.meal_plans
  for each row execute function public.guard_meal_plan();

-- 2g. an enrollment's identity never changes (switch plans = new row) ------------------------
create function public.guard_enrollment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.plan_id <> old.plan_id or new.version <> old.version then
    raise exception 'enrollment user/plan/version are immutable; enroll again instead' using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger enrollments_guard before update on public.enrollments
  for each row execute function public.guard_enrollment();

-- 3. row level security -------------------------------------------------------------------
alter table public.foods            enable row level security;
alter table public.swap_groups      enable row level security;
alter table public.meal_plans       enable row level security;
alter table public.plan_meals       enable row level security;
alter table public.plan_ingredients enable row level security;
alter table public.profiles         enable row level security;
alter table public.enrollments      enable row level security;
alter table public.food_logs        enable row level security;
alter table public.custom_foods     enable row level security;
alter table public.day_meals        enable row level security;
alter table public.favorite_meals   enable row level security;

-- 3a. catalog: world-readable, admin-writable ------------------------------------------------
create policy foods_select on public.foods for select to anon, authenticated using (true);
create policy foods_insert_admin on public.foods for insert to authenticated with check (public.is_admin());
create policy foods_update_admin on public.foods for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy foods_delete_admin on public.foods for delete to authenticated using (public.is_admin());

create policy swap_groups_select on public.swap_groups for select to anon, authenticated using (true);
create policy swap_groups_insert_admin on public.swap_groups for insert to authenticated with check (public.is_admin());
create policy swap_groups_update_admin on public.swap_groups for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy swap_groups_delete_admin on public.swap_groups for delete to authenticated using (public.is_admin());

-- 3b. plans: published for everyone; drafts for admins; archived only for enrolled users -----------
create policy meal_plans_select_published on public.meal_plans
  for select to anon, authenticated using (status = 'published');
create policy meal_plans_select_admin on public.meal_plans
  for select to authenticated using (public.is_admin());
create policy meal_plans_select_enrolled on public.meal_plans
  for select to authenticated using (public.is_enrolled_in_plan(meal_plans.id, meal_plans.version));
-- new plans always start as drafts; they only become published through publish_plan()
create policy meal_plans_insert_admin on public.meal_plans
  for insert to authenticated with check (public.is_admin() and status = 'draft');
create policy meal_plans_update_admin on public.meal_plans
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy meal_plans_delete_admin on public.meal_plans
  for delete to authenticated using (public.is_admin());

-- Meals / ingredients inherit visibility from their plan: the EXISTS subquery runs as the
-- caller, so meal_plans' own policies decide (published / admin / enrolled).
create policy plan_meals_select on public.plan_meals
  for select to anon, authenticated using (
    exists (select 1 from public.meal_plans p where p.id = plan_meals.plan_id and p.version = plan_meals.version)
  );
create policy plan_meals_insert_admin on public.plan_meals for insert to authenticated with check (public.is_admin());
create policy plan_meals_update_admin on public.plan_meals for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plan_meals_delete_admin on public.plan_meals for delete to authenticated using (public.is_admin());

create policy plan_ingredients_select on public.plan_ingredients
  for select to anon, authenticated using (
    exists (select 1 from public.meal_plans p where p.id = plan_ingredients.plan_id and p.version = plan_ingredients.version)
  );
create policy plan_ingredients_insert_admin on public.plan_ingredients for insert to authenticated with check (public.is_admin());
create policy plan_ingredients_update_admin on public.plan_ingredients for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plan_ingredients_delete_admin on public.plan_ingredients for delete to authenticated using (public.is_admin());

-- 3c. profiles: owner only; is_admin pinned to its stored value -------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()) and is_admin = false);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and is_admin = public.is_admin());
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

-- 3d. enrollments: owner only; may only enroll in a currently published version --------------------
create policy enrollments_select_own on public.enrollments
  for select to authenticated using (user_id = (select auth.uid()));
create policy enrollments_insert_own on public.enrollments
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.meal_plans p
      where p.id = enrollments.plan_id and p.version = enrollments.version and p.status = 'published'
    )
  );
create policy enrollments_update_own on public.enrollments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy enrollments_delete_own on public.enrollments
  for delete to authenticated using (user_id = (select auth.uid()));

-- 3e. food_logs / custom_foods / day_meals / favorite_meals: owner only ------------------------------------------------
create policy food_logs_select_own on public.food_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy food_logs_insert_own on public.food_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_logs_update_own on public.food_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_logs_delete_own on public.food_logs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy custom_foods_select_own on public.custom_foods
  for select to authenticated using (user_id = (select auth.uid()));
create policy custom_foods_insert_own on public.custom_foods
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy custom_foods_update_own on public.custom_foods
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy custom_foods_delete_own on public.custom_foods
  for delete to authenticated using (user_id = (select auth.uid()));

create policy day_meals_select_own on public.day_meals
  for select to authenticated using (user_id = (select auth.uid()));
create policy day_meals_insert_own on public.day_meals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy day_meals_update_own on public.day_meals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy day_meals_delete_own on public.day_meals
  for delete to authenticated using (user_id = (select auth.uid()));

create policy favorite_meals_select_own on public.favorite_meals
  for select to authenticated using (user_id = (select auth.uid()));
create policy favorite_meals_insert_own on public.favorite_meals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorite_meals_update_own on public.favorite_meals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy favorite_meals_delete_own on public.favorite_meals
  for delete to authenticated using (user_id = (select auth.uid()));

-- 4. grants -------------------------------------------------------------------------------------------
-- Supabase's default privileges hand every role ALL on new public tables and rely on RLS.
-- Tighten anyway: anon only ever reads the catalog; TRUNCATE (which bypasses RLS) is
-- never available to API roles.
revoke all on public.foods, public.swap_groups, public.meal_plans, public.plan_meals,
              public.plan_ingredients, public.profiles, public.enrollments, public.food_logs,
              public.custom_foods, public.day_meals, public.favorite_meals
  from anon;
grant select on public.foods, public.swap_groups, public.meal_plans,
                public.plan_meals, public.plan_ingredients
  to anon;
revoke truncate, references, trigger on public.foods, public.swap_groups, public.meal_plans,
              public.plan_meals, public.plan_ingredients, public.profiles, public.enrollments,
              public.food_logs, public.custom_foods, public.day_meals, public.favorite_meals
  from authenticated;

-- Trigger functions are never called directly.
revoke execute on function public.set_updated_at()          from public, anon, authenticated;
revoke execute on function public.lww_guard()               from public, anon, authenticated;
revoke execute on function public.profiles_protect_admin()  from public, anon, authenticated;
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
revoke execute on function public.guard_plan_content()      from public, anon, authenticated;
revoke execute on function public.guard_meal_plan()         from public, anon, authenticated;
revoke execute on function public.guard_enrollment()        from public, anon, authenticated;

-- is_admin() is used inside policies, so both API roles need EXECUTE. It only ever
-- reveals the caller's own flag.
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to anon, authenticated;
revoke execute on function public.is_enrolled_in_plan(text, integer) from public, anon;
grant  execute on function public.is_enrolled_in_plan(text, integer) to authenticated;

-- 5. RPCs -----------------------------------------------------------------------------------------------

-- 5a. publish_plan: admin only, atomic ----------------------------------------------------------------
create function public.publish_plan(p_id text, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- serialise concurrent publishes of the same plan id
  perform 1 from public.meal_plans where id = p_id for update;

  select status into v_status from public.meal_plans where id = p_id and version = p_version;
  if v_status is null then
    raise exception 'plan %@% does not exist', p_id, p_version using errcode = 'P0002';
  end if;
  if v_status = 'published' then
    return;  -- idempotent
  end if;
  if not exists (select 1 from public.plan_meals where plan_id = p_id and version = p_version) then
    raise exception 'plan %@% has no meals and cannot be published', p_id, p_version using errcode = '23514';
  end if;

  -- archive first so the one-published-per-id unique index is never violated
  update public.meal_plans set status = 'archived'
    where id = p_id and status = 'published' and version <> p_version;
  update public.meal_plans set status = 'published', published_at = pg_catalog.now()
    where id = p_id and version = p_version;
end;
$$;
revoke execute on function public.publish_plan(text, integer) from public, anon;
grant  execute on function public.publish_plan(text, integer) to authenticated;

-- 5b. enroll_in_plan: atomically switch the user's current plan ------------------------------------------
-- SECURITY INVOKER on purpose: RLS (published-only, owner-only) applies. Needed because the
-- one-current-per-user unique index forbids "insert new, then flip old" in the other order.
create function public.enroll_in_plan(p_id text, p_version integer, p_started_on date default null)
returns public.enrollments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.enrollments;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.enrollments e
    where e.user_id = v_uid and e.plan_id = p_id and e.version = p_version and e."current";
  if found then
    return v_row;
  end if;

  update public.enrollments set "current" = false where user_id = v_uid and "current";
  insert into public.enrollments (user_id, plan_id, version, started_on, "current")
    values (v_uid, p_id, p_version, coalesce(p_started_on, current_date), true)
    returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.enroll_in_plan(text, integer, date) from public, anon;
grant  execute on function public.enroll_in_plan(text, integer, date) to authenticated;

-- 5c. delete_my_account: Apple requires in-app account deletion ---------------------------------------------
-- Deletes the caller's auth.users row; everything user-owned (profiles, enrollments,
-- food_logs, custom_foods, day_meals, favorite_meals, auth identities and sessions) cascades.
-- plans authored by the user keep existing (meal_plans.created_by -> NULL).
--
-- REQUIRES that the function owner may delete from auth.users. That is true for the
-- default `postgres` role in Supabase, which owns functions created by migrations or the
-- SQL editor. If you change the owner, grant: `grant delete on auth.users to <owner>`.
--
-- Sign in with Apple: Apple also expects the app to revoke the user's Apple token on
-- deletion. That needs Apple's REST API + a client secret, so do it in an Edge Function
-- that calls the revoke endpoint and then this RPC (or auth.admin.deleteUser).
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

commit;
