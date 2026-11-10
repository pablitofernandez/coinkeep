-- ============================================================
--  Telemetría de partidas de Coinkeep (Supabase).
--  Pégalo en el editor SQL de tu proyecto (SQL Editor → New query → Run).
--
--  El juego solo puede AÑADIR filas: nadie puede leerlas, cambiarlas ni borrarlas
--  con la clave pública. Para leerlas hace falta la clave secreta (npm run logs:pull).
--
--  Cada partida envía varias filas con el mismo `session`: una al acabar cada oleada
--  (solo con las oleadas nuevas), otra al perder y otra si se cierra la página.
--  scripts/pull-logs.mjs las junta en un archivo por partida.
-- ============================================================
create table if not exists public.game_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session     uuid        not null,              -- una partida
  player      uuid        not null,              -- un navegador (anónimo, aleatorio)
  seq         integer     not null check (seq between 0 and 100000),
  event       text        not null check (event in ('wave', 'over', 'left')),
  version     text        not null check (char_length(version) <= 40),
  difficulty  text        not null check (difficulty in ('normal', 'hard', 'nightmare')),
  wave        integer     not null check (wave between 0 and 5000),
  seconds     integer     not null check (seconds between 0 and 10000000),
  mobile      boolean     not null,
  screen      text        not null check (char_length(screen) <= 40),
  platform    text        not null check (char_length(platform) <= 20),
  cheats      boolean     not null default false,
  data        jsonb       not null check (octet_length(data::text) < 60000)
);

create index if not exists game_logs_session on public.game_logs (session, seq);

alter table public.game_logs enable row level security;

drop policy if exists "añadir registros" on public.game_logs;
create policy "añadir registros" on public.game_logs for insert to anon with check (true);

-- con la clave pública solo se puede insertar (ni leer, ni cambiar, ni borrar)
revoke all on public.game_logs from anon, authenticated;
grant insert (session, player, seq, event, version, difficulty, wave, seconds, mobile, screen, platform, cheats, data)
  on public.game_logs to anon;
