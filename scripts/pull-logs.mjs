// ============================================================
//  npm run logs:pull — descarga la telemetría de Supabase (tabla game_logs)
//  y la guarda en logs/remote/, un archivo por partida, con el mismo formato
//  que los registros locales de logs/ (session, device, result, totals, waves[]).
//
//  Necesita la clave SECRETA de Supabase en .env.local (nunca se sube):
//    SUPABASE_SECRET_KEY=sb_secret_…
//  La URL la toma de .env (VITE_SUPABASE_URL).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const env = {};
for (const f of ['.env', '.env.local']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const URL_ = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error('Falta VITE_SUPABASE_URL en .env o SUPABASE_SECRET_KEY en .env.local');
  process.exit(1);
}
const headers = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };

const dir = path.join(root, 'logs', 'remote');
fs.mkdirSync(dir, { recursive: true });
const cursorFile = path.join(dir, '.cursor');
let cursor = fs.existsSync(cursorFile) ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0 : 0;

// 1) filas nuevas desde la última descarga, por páginas
const rows = [];
for (;;) {
  const r = await fetch(`${URL_}/rest/v1/game_logs?id=gt.${cursor}&order=id.asc&limit=1000`, { headers });
  if (!r.ok) { console.error('Error de Supabase:', r.status, await r.text()); process.exit(1); }
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
  cursor = page[page.length - 1].id;
}
if (!rows.length) { console.log('No hay partidas nuevas.'); process.exit(0); }

// 2) juntar por partida (añadiendo a lo ya descargado de esa partida)
const bySession = new Map();
for (const row of rows) {
  if (!bySession.has(row.session)) bySession.set(row.session, []);
  bySession.get(row.session).push(row);
}
const stamp = iso => iso.slice(0, 19).replace('T', '_').replace(/:/g, '-');
let created = 0, updated = 0;
for (const [session, list] of bySession) {
  list.sort((a, b) => a.seq - b.seq);
  const existing = fs.readdirSync(dir).find(f => f.endsWith(`_${session.slice(0, 8)}.json`));
  const file = existing ?? `${stamp(list[0].created_at)}_${session.slice(0, 8)}.json`;
  const p = path.join(dir, file);
  const log = existing ? JSON.parse(fs.readFileSync(p, 'utf8')) : {
    session, player: list[0].player, startedAt: list[0].created_at,
    version: list[0].version, difficulty: list[0].difficulty, cheats: false,
    device: { mobile: list[0].mobile, screen: list[0].screen, platform: list[0].platform },
    waves: [], events: [],
  };
  for (const row of list) {
    const seen = new Set(log.waves.map(w => w.wave));
    for (const w of row.data.waves ?? []) if (!seen.has(w.wave)) log.waves.push(w);
    log.events.push(`${row.seq}:${row.event}@${row.wave}`);
    log.cheats ||= row.cheats;
    log.updatedAt = row.created_at;
    log.result = { over: row.event === 'over', left: row.event === 'left', waveReached: row.wave, seconds: row.seconds, towers: row.data.now?.towers?.split(' ').filter(Boolean).length ?? 0 };
    log.now = row.data.now;
    log.totals = row.data.totals;
  }
  log.waves.sort((a, b) => a.wave - b.wave);
  fs.writeFileSync(p, JSON.stringify(log, null, 1));
  if (existing) updated++; else created++;
}
fs.writeFileSync(cursorFile, String(rows[rows.length - 1].id));
console.log(`${rows.length} filas · ${created} partidas nuevas, ${updated} actualizadas → logs/remote/`);
