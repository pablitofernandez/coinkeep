// ============================================================
//  Global leaderboard (Supabase). Talks directly to its REST API
//  (PostgREST) with the public "anon" key: no extra libraries.
//  The table and its rules are in supabase/schema.sql. The URL and key
//  go in the .env file (VITE_SUPABASE_URL and VITE_SUPABASE_KEY): they're
//  public by design, security comes from the table's rules.
// ============================================================
import type { Difficulty } from './game/types';

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
const NAME_KEY = 'sg-name';

/** Is a leaderboard configured? (without .env the game works just the same, only without global records) */
export const leaderboardEnabled = !!(URL && KEY);

export interface Score { name: string; wave: number; seconds: number; difficulty: Difficulty }

/**
 * Headers: the key goes in `apikey`. Supabase's new keys ("publishable", sb_publishable_…) are not
 * a JWT and must not go in Authorization; the legacy ones ("anon", eyJ…) must.
 */
const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: KEY!,
  ...(KEY!.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
  ...extra,
});

/** Supabase connection, shared with telemetry (telemetry.ts). */
export const SUPABASE = { url: URL ?? '', enabled: leaderboardEnabled, headers };

/**
 * Clean up the name: no control, invisible or text-direction characters, no extra spaces,
 * 1–16 characters. The server checks the same thing (supabase/schema.sql): if you change one, change the other.
 */
export function cleanName(s: string) {
  return s.replace(/[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 16).trim();
}

export const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* no storage */ } };

async function call(path: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`Leaderboard: ${r.status} ${await r.text()}`);
    return r;
  } finally { clearTimeout(timer); }
}

/** The best for a difficulty: most waves first; on a tie, whoever got there faster. */
export async function topScores(difficulty: Difficulty, limit = 10): Promise<Score[]> {
  const r = await call(`scores?select=name,wave,seconds,difficulty&difficulty=eq.${difficulty}&order=wave.desc,seconds.asc,id.asc&limit=${limit}`, { headers: headers() });
  return r.json();
}

/** Rank this score would take (1 = the best). */
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
