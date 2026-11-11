// ============================================================
//  npm run logs:pull — downloads the telemetry from Supabase (game_logs table)
//  and saves it to logs/remote/, one file per game, in the same format
//  as the local logs in logs/ (session, device, result, totals, waves[]).
//
//  Needs the Supabase SECRET key in .env.local (never committed):
//    SUPABASE_SECRET_KEY=sb_secret_…
//  The URL is taken from .env (VITE_SUPABASE_URL).
//
//  CAREFUL: anyone can write rows (public key). Everything goes through
//  clean-log.mjs, which keeps only the fields and formats the game sends.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { cleanRow, cleanWave } from './clean-log.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

/** Reads a simple .env file (KEY=value). */
function readEnv(file) {
  const env = {};
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const pub = readEnv('.env'), local = readEnv('.env.local');
const URL_ = (local.VITE_SUPABASE_URL ?? pub.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
// the secret key ONLY from .env.local: .env is committed to the public repo
const KEY = local.SUPABASE_SECRET_KEY;
if (pub.SUPABASE_SECRET_KEY) {
  console.error('Careful! There is a SUPABASE_SECRET_KEY in .env, which is committed to the public repo. Move it to .env.local (and rotate it in Supabase if it was already pushed).');
  process.exit(1);
}
if (!URL_ || !KEY) {
  console.error('Missing VITE_SUPABASE_URL in .env or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}
if (!URL_.startsWith('https://')) {
  console.error('VITE_SUPABASE_URL must start with https:// (the secret key is never sent unencrypted)');
  process.exit(1);
}
const headers = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };

const dir = path.join(root, 'logs', 'remote');
fs.mkdirSync(dir, { recursive: true });
const cursorFile = path.join(dir, '.cursor');
let cursor = fs.existsSync(cursorFile) ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0 : 0;

// 1) new rows since the last download, page by page
const rawRows = [];
for (;;) {
  const r = await fetch(`${URL_}/rest/v1/game_logs?id=gt.${cursor}&order=id.asc&limit=1000`, { headers });
  if (!r.ok) { console.error('Supabase error:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const page = await r.json();
  if (!Array.isArray(page)) { console.error('Unexpected response from Supabase'); process.exit(1); }
  rawRows.push(...page);
  if (page.length < 1000) break;
  const lastId = page[page.length - 1]?.id;
  if (!Number.isInteger(lastId)) { console.error('Unexpected response from Supabase'); process.exit(1); }
  cursor = lastId;
}
if (!rawRows.length) { console.log('No new games.'); process.exit(0); }

// 2) clean: anything that doesn't have the game's shape is discarded
const rows = [];
let badRows = 0, badWaves = 0;
for (const raw of rawRows) {
  const row = cleanRow(raw);
  if (!row) { badRows++; continue; }
  badWaves += row.badWaves;
  rows.push(row);
}

// 3) group by game (appending to what was already downloaded for that game)
const bySession = new Map();
for (const row of rows) {
  if (!bySession.has(row.session)) bySession.set(row.session, []);
  bySession.get(row.session).push(row);
}
const stamp = iso => iso.slice(0, 19).replace('T', '_').replace(/:/g, '-');
let created = 0, updated = 0, failed = 0;
for (const [session, list] of bySession) {
  try {
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
    // files downloaded before this filter existed also go through it
    log.waves = (Array.isArray(log.waves) ? log.waves : []).map(cleanWave).filter(Boolean);
    if (!Array.isArray(log.events)) log.events = [];
    for (const row of list) {
      const seen = new Set(log.waves.map(w => w.wave));
      for (const w of row.data.waves) if (!seen.has(w.wave)) log.waves.push(w);
      log.events.push(`${row.seq}:${row.event}@${row.wave}`);
      log.cheats ||= row.cheats;
      log.updatedAt = row.created_at;
      log.result = { over: row.event === 'over', left: row.event === 'left', waveReached: row.wave, seconds: row.seconds, towers: row.data.now?.towers.split(' ').filter(Boolean).length ?? 0 };
      log.now = row.data.now;
      log.totals = row.data.totals;
    }
    log.waves.sort((a, b) => a.wave - b.wave);
    fs.writeFileSync(p, JSON.stringify(log, null, 1));
    if (existing) updated++; else created++;
  } catch (e) {
    failed++;
    console.error(`Could not save game ${session.slice(0, 8)}: ${e.message}`);
  }
}
fs.writeFileSync(cursorFile, String(rawRows[rawRows.length - 1].id));
console.log(`${rawRows.length} rows · ${created} new games, ${updated} updated → logs/remote/`);
if (badRows || badWaves) console.warn(`⚠ Discarded for not matching the game's format: ${badRows} rows and ${badWaves} waves. It may be junk inserted by hand into the table: check it in the Supabase dashboard.`);
if (failed) console.warn(`⚠ ${failed} games could not be saved.`);
