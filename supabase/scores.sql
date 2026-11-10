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
revoke all on public.scores from anon;
grant select on public.scores to anon;
grant insert (name, wave, seconds, difficulty) on public.scores to anon;
