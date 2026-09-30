-- KinetixFit: Supabase Postgres as source of truth for account data.
-- Every table: user_id -> auth.users, RLS restricted to the owning user, updated_at auto-maintained.
-- No retention pruning here — server keeps complete history indefinitely.

create or replace function kx_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Singletons (LWW)
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  height numeric,
  weight numeric,
  target text,
  personal_allergens jsonb not null default '[]'::jsonb,
  workouts_logged jsonb not null default '[]'::jsonb,
  smart_device_connected text,
  wearable text,
  sex text,
  age integer,
  activity_level text,
  last_period_start_date date,
  average_cycle_length integer,
  region text,
  country text,
  diet text,
  onboarded boolean not null default false,
  ob_step integer,
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "profiles_owner" on profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger profiles_updated_at before update on profiles
  for each row execute function kx_set_updated_at();

create table if not exists preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table preferences enable row level security;
create policy "preferences_owner" on preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger preferences_updated_at before update on preferences
  for each row execute function kx_set_updated_at();

-- ---------------------------------------------------------------------------
-- Keyed rows (idempotent upsert, never last-write-wins field overwrite)
-- ---------------------------------------------------------------------------

create table if not exists saved_foods (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  per100g jsonb,
  units jsonb,
  density numeric,
  uses integer,
  last_used bigint,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table saved_foods enable row level security;
create policy "saved_foods_owner" on saved_foods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger saved_foods_updated_at before update on saved_foods
  for each row execute function kx_set_updated_at();

create table if not exists food_log_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  day date not null,
  per100g jsonb,
  extras jsonb,
  meal jsonb,
  amount_guess boolean,
  note text,
  data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists food_log_entries_user_day_idx on food_log_entries (user_id, day);
alter table food_log_entries enable row level security;
create policy "food_log_entries_owner" on food_log_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger food_log_entries_updated_at before update on food_log_entries
  for each row execute function kx_set_updated_at();

create table if not exists water_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  at bigint not null,
  ml numeric not null,
  day date not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists water_logs_user_day_idx on water_logs (user_id, day);
alter table water_logs enable row level security;
create policy "water_logs_owner" on water_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger water_logs_updated_at before update on water_logs
  for each row execute function kx_set_updated_at();

create table if not exists workouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  source text not null,
  data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table workouts enable row level security;
create policy "workouts_owner" on workouts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger workouts_updated_at before update on workouts
  for each row execute function kx_set_updated_at();

create table if not exists gut_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table gut_checks enable row level security;
create policy "gut_checks_owner" on gut_checks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger gut_checks_updated_at before update on gut_checks
  for each row execute function kx_set_updated_at();

create table if not exists morning_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table morning_checkins enable row level security;
create policy "morning_checkins_owner" on morning_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger morning_checkins_updated_at before update on morning_checkins
  for each row execute function kx_set_updated_at();

create table if not exists periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table periods enable row level security;
create policy "periods_owner" on periods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger periods_updated_at before update on periods
  for each row execute function kx_set_updated_at();

-- Event-level: multiple readings per day per metric must never collapse into one row.
create table if not exists vitals_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  metric text not null,
  value numeric not null,
  source text,
  recorded_at bigint not null,
  day date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists vitals_history_user_metric_recorded_idx
  on vitals_history (user_id, metric, recorded_at);
alter table vitals_history enable row level security;
create policy "vitals_history_owner" on vitals_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger vitals_history_updated_at before update on vitals_history
  for each row execute function kx_set_updated_at();

-- ---------------------------------------------------------------------------
-- Server-authoritative (written only by api/ with the service-role key; RLS still
-- restricts client reads/writes to the owning row — clients never write these directly)
-- ---------------------------------------------------------------------------

create table if not exists points_ledger (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  award_id text not null,
  points integer not null,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day, award_id)
);
alter table points_ledger enable row level security;
create policy "points_ledger_owner_read" on points_ledger for select
  using (auth.uid() = user_id);

create table if not exists streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current integer not null default 0,
  best integer not null default 0,
  last_checkin_day date,
  updated_at timestamptz not null default now()
);
alter table streaks enable row level security;
create policy "streaks_owner_read" on streaks for select
  using (auth.uid() = user_id);
create trigger streaks_updated_at before update on streaks
  for each row execute function kx_set_updated_at();

create table if not exists quest_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  quest_id text not null,
  points integer not null,
  xp integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, day, quest_id)
);
alter table quest_claims enable row level security;
create policy "quest_claims_owner_read" on quest_claims for select
  using (auth.uid() = user_id);
