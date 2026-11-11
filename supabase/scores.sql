-- ============================================================
--  Clasificación global de Coinkeep (Supabase).
--  Pégalo en el editor SQL de tu proyecto (SQL Editor → New query → Run).
--  Cualquiera puede LEER y AÑADIR puntuaciones; nadie puede cambiarlas ni borrarlas
--  (salvo tú desde el panel de Supabase).
-- ============================================================
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 16),
  wave        integer     not null check (wave between 1 and 2000),
  seconds     integer     not null check (seconds between 0 and 1000000),
  difficulty  text        not null check (difficulty in ('normal', 'hard', 'nightmare')),
  created_at  timestamptz not null default now(),
  -- comprobación básica contra trampas: cada oleada dura como mínimo unos segundos
  constraint plausible check (seconds >= wave * 10)
);

create index if not exists scores_rank on public.scores (difficulty, wave desc, seconds asc);

alter table public.scores enable row level security;

drop policy if exists "leer puntuaciones" on public.scores;
create policy "leer puntuaciones" on public.scores for select to anon using (true);

drop policy if exists "añadir puntuaciones" on public.scores;
create policy "añadir puntuaciones" on public.scores for insert to anon with check (true);

-- solo se puede escribir en estas columnas (id y created_at los pone la base de datos)
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon;
grant insert (name, wave, seconds, difficulty) on public.scores to anon;

-- ============================================================
--  Reglas más estrictas (2026-11). Se pueden ejecutar varias veces sin problema.
--  «not valid»: solo se aplican a los récords NUEVOS; los que ya hay se quedan como están.
-- ============================================================

-- tope de oleada realista (la regla original del create table, 1–2000, sigue ahí: esta es más estricta)
alter table public.scores drop constraint if exists wave_realista;
alter table public.scores add constraint wave_realista check (wave <= 300) not valid;

-- tiempo mínimo: cada oleada dura de verdad unos 19–21 s (inicio de 5 s + 18 s por oleada, con margen)
alter table public.scores drop constraint if exists plausible;
alter table public.scores add constraint plausible check (seconds >= 5 + (wave - 1) * 18) not valid;

-- nombre limpio, igual que cleanName() en src/leaderboard.ts: sin espacios al principio o al final,
-- sin espacios dobles, sin caracteres de control, invisibles ni de dirección de texto, y sin < >
alter table public.scores drop constraint if exists nombre_limpio;
alter table public.scores add constraint nombre_limpio check (
  name = btrim(name)
  and name !~ '\s\s'
  and name !~ '[[:cntrl:]<>\u0080-\u009f​-‏‪-‮⁦-⁩﻿]'
) not valid;

-- tope de espacio: si alguien inunda la tabla, se dejan de aceptar récords antes de llenar el plan gratuito
-- (cada récord ocupa ~100 bytes: 50 MB son cientos de miles). Para volver a aceptar, borra la basura desde el panel.
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
