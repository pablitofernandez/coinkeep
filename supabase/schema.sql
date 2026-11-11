-- ============================================================
--  Coinkeep database (Supabase): global leaderboard and telemetry.
--  For a new project: paste it into the SQL editor (SQL Editor → New query → Run).
--  Some database object names (constraints, policies, error messages) are in Spanish because they already exist in the live database.
--
--  With the public key (the one shipped in the game):
--    · scores    → anyone READS and ADDS scores; nobody changes or deletes.
--    · game_logs → rows can only be ADDED; nobody reads, changes or deletes.
--  Reading the telemetry requires the secret key (npm run logs:pull).
--  To delete junk: use the Supabase dashboard.
--
--  The rules match the code: if you change one, change the other.
--    · score names            ↔ cleanName() in src/leaderboard.ts
--    · telemetry columns      ↔ src/telemetry.ts and scripts/clean-log.mjs
-- ============================================================


-- ============================================================
--  Global leaderboard (src/leaderboard.ts)
-- ============================================================
create table if not exists public.scores (
  id          bigint      generated always as identity primary key,
  name        text        not null,
  wave        integer     not null check (wave between 1 and 300),
  seconds     integer     not null check (seconds between 0 and 1000000),
  difficulty  text        not null check (difficulty in ('normal', 'hard', 'nightmare')),
  created_at  timestamptz not null default now(),

  -- clean name: 1–16 characters, no leading, trailing or double spaces,
  -- no control, invisible or text-direction characters, and no < >
  constraint nombre_limpio check (
    char_length(name) between 1 and 16
    and name = btrim(name)
    and name !~ '\s\s'
    and name !~ '[[:cntrl:]<>\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  -- against crude cheating: each wave really lasts about 19–21 s (5 s start + 18 s per wave, with margin)
  constraint plausible check (seconds >= 5 + (wave - 1) * 18)
);

create index if not exists scores_rank on public.scores (difficulty, wave desc, seconds asc);

alter table public.scores enable row level security;

drop policy if exists "leer puntuaciones" on public.scores;
create policy "leer puntuaciones" on public.scores for select to anon using (true);

drop policy if exists "añadir puntuaciones" on public.scores;
create policy "añadir puntuaciones" on public.scores for insert to anon with check (true);

-- only these columns can be written (id and created_at are set by the database)
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon;
grant insert (name, wave, seconds, difficulty) on public.scores to anon;

-- space cap: if someone floods the table, scores stop being accepted before the free plan fills up
-- (each score takes ~100 bytes: 50 MB is hundreds of thousands)
create or replace function public.scores_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.pg_total_relation_size('public.scores') > 50 * 1024 * 1024 then
    raise exception 'La clasificación está llena' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.scores_guard() from public, anon, authenticated;

drop trigger if exists scores_guard on public.scores;
create trigger scores_guard before insert on public.scores
  for each row execute function public.scores_guard();


-- ============================================================
--  Game telemetry (src/telemetry.ts; published build only)
--
--  Each game sends several rows with the same `session`: one when each wave ends
--  (only with the new waves), another on losing and another if the page is closed.
--  scripts/pull-logs.mjs merges them into one file per game.
-- ============================================================
create table if not exists public.game_logs (
  id          bigint      generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session     uuid        not null,              -- one game
  player      uuid        not null,              -- one browser (anonymous, random)
  seq         integer     not null check (seq between 0 and 100000),
  event       text        not null check (event in ('wave', 'over', 'left')),
  version     text        not null check (version ~ '^([0-9a-f]{7,40}|dev)$'),   -- build commit
  difficulty  text        not null check (difficulty in ('normal', 'hard', 'nightmare')),
  wave        integer     not null check (wave between 0 and 5000),
  seconds     integer     not null check (seconds between 0 and 10000000),
  mobile      boolean     not null,
  screen      text        not null check (screen ~ '^[0-9]{1,5}x[0-9]{1,5}@[0-9]{1,2}(\.[0-9]{1,2})?$'),
  platform    text        not null check (platform in ('iPhone', 'iPad', 'Android', 'Windows', 'Mac', 'Linux', 'Otro')),
  cheats      boolean     not null default false,
  -- a JSON object; a real row takes ~1–2 KB
  data        jsonb       not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 20000)
);

create index if not exists game_logs_session on public.game_logs (session, seq);
create index if not exists game_logs_created on public.game_logs (created_at);

alter table public.game_logs enable row level security;

drop policy if exists "añadir registros" on public.game_logs;
create policy "añadir registros" on public.game_logs for insert to anon with check (true);

-- with the public key you can only insert (not read, change or delete)
revoke all on public.game_logs from anon, authenticated;
grant insert (session, player, seq, event, version, difficulty, wave, seconds, mobile, screen, platform, cheats, data)
  on public.game_logs to anon;

-- flood caps: if someone keeps sending rows, they stop being accepted (some telemetry is lost
-- for a while, nothing more). Real rate in Nov 2026: at most ~150 rows per hour.
--   · 3,000 rows in the last hour, counting everyone
--   · 300 MB in total (the free plan has 500 MB for the whole database)
create or replace function public.game_logs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.pg_total_relation_size('public.game_logs') > 300 * 1024 * 1024 then
    raise exception 'Telemetría llena' using errcode = 'P0001';
  end if;
  if (select count(*) from (
        select 1 from public.game_logs
        where created_at > pg_catalog.now() - interval '1 hour'
        limit 3000) recientes) >= 3000 then
    raise exception 'Demasiada telemetría en la última hora' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.game_logs_guard() from public, anon, authenticated;

drop trigger if exists game_logs_guard on public.game_logs;
create trigger game_logs_guard before insert on public.game_logs
  for each row execute function public.game_logs_guard();
