// ============================================================
//  Clasificación global (Supabase). Habla directamente con su API REST
//  (PostgREST) con la clave pública «anon»: sin librerías extra.
//  La tabla y sus reglas están en supabase/scores.sql. La URL y la clave
//  van en el archivo .env (VITE_SUPABASE_URL y VITE_SUPABASE_KEY): son
//  públicas por diseño, la seguridad la ponen las reglas de la tabla.
// ============================================================
import type { Difficulty } from './game/types';

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
const NAME_KEY = 'sg-name';

/** ¿Hay clasificación configurada? (sin .env el juego funciona igual, solo que sin récords globales) */
export const leaderboardEnabled = !!(URL && KEY);

export interface Score { name: string; wave: number; seconds: number; difficulty: Difficulty }

/**
 * Cabeceras: la clave va en `apikey`. Las claves nuevas de Supabase («publishable», sb_publishable_…) no son
 * un JWT y no deben ir en Authorization; las antiguas («anon», eyJ…) sí.
 */
const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: KEY!,
  ...(KEY!.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
  ...extra,
});

/** Conexión con Supabase, compartida con la telemetría (telemetry.ts). */
export const SUPABASE = { url: URL ?? '', enabled: leaderboardEnabled, headers };

/**
 * Limpia el nombre: sin caracteres de control, invisibles ni de dirección de texto, sin espacios de más,
 * 1–16 caracteres. El servidor comprueba lo mismo (supabase/scores.sql): si cambias uno, cambia el otro.
 */
export function cleanName(s: string) {
  return s.replace(/[\u0000-\u001f\u007f-\u009f<>​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 16).trim();
}

export const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* sin almacenamiento */ } };

async function call(path: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`Clasificación: ${r.status} ${await r.text()}`);
    return r;
  } finally { clearTimeout(timer); }
}

/** Los mejores de una dificultad: más oleadas primero; a igualdad, quien llegó antes. */
export async function topScores(difficulty: Difficulty, limit = 10): Promise<Score[]> {
  const r = await call(`scores?select=name,wave,seconds,difficulty&difficulty=eq.${difficulty}&order=wave.desc,seconds.asc,id.asc&limit=${limit}`, { headers: headers() });
  return r.json();
}

/** Puesto que ocuparía esta puntuación (1 = el mejor). */
export async function rankOf(s: Score): Promise<number> {
  const better = `or=(wave.gt.${s.wave},and(wave.eq.${s.wave},seconds.lt.${s.seconds}))`;
  const r = await call(`scores?select=id&difficulty=eq.${s.difficulty}&${better}&limit=1`, { headers: headers({ Prefer: 'count=exact' }) });
  const total = Number(r.headers.get('content-range')?.split('/')[1] ?? 0);
  return total + 1;
}

export async function submitScore(s: Score): Promise<void> {
  const name = cleanName(s.name);
  saveName(name);
  await call('scores', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...s, name }),
  });
}
