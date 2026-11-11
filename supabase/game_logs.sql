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

-- ============================================================
--  Reglas más estrictas (2026-11). Se pueden ejecutar varias veces sin problema.
--  «not valid»: solo se aplican a las filas NUEVAS.
-- ============================================================

-- cada columna con el formato que manda el juego (src/telemetry.ts) y nada más
alter table public.game_logs drop constraint if exists formato;
alter table public.game_logs add constraint formato check (
  jsonb_typeof(data) = 'object'
  and octet_length(data::text) < 20000             -- una fila real ocupa ~1–2 KB
  and version ~ '^([0-9a-f]{7,40}|dev)$'
  and screen ~ '^[0-9]{1,5}x[0-9]{1,5}@[0-9]{1,2}(\.[0-9]{1,2})?$'
  and platform in ('iPhone', 'iPad', 'Android', 'Windows', 'Mac', 'Linux', 'Otro')
) not valid;

-- topes contra inundaciones: si alguien manda filas sin parar, se dejan de aceptar (se pierde telemetría
-- un rato, nada más). Ritmo real en nov. 2026: como mucho ~150 filas por hora.
--   · 3.000 filas en la última hora, contando a todo el mundo
--   · 300 MB en total (el plan gratuito tiene 500 MB para toda la base de datos)
-- Para volver a aceptar tras una inundación, borra la basura desde el panel.
create index if not exists game_logs_created on public.game_logs (created_at);

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
