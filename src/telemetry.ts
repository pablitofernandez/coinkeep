// ============================================================
//  Anonymous gameplay telemetry (published version only).
//  Sends to Supabase (game_logs table, see supabase/schema.sql) the
//  same per-wave log that devlog.ts stores locally, to balance
//  the difficulty with real games.
//
//  - At the end of each wave: only the new waves (small rows).
//  - On losing: the last wave and the final result.
//  - On closing or leaving the tab: where the player stopped (to learn when people quit).
//  No names or personal data: a random id per game and another per browser.
// ============================================================
import type { GameState } from './game/types';
import { SUPABASE } from './leaderboard';

const ENABLED = import.meta.env.PROD && SUPABASE.enabled;
const PLAYER_KEY = 'sg-player';

const uuid = () => crypto.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

function playerId() {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) { id = uuid(); localStorage.setItem(PLAYER_KEY, id); }
    return id;
  } catch { return uuid(); }
}

/** Approximate OS (without the full userAgent). */
function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Otro';
}

type Event = 'wave' | 'over' | 'left';

export class Telemetry {
  private player = ENABLED ? playerId() : '';
  private session = '';
  private seq = 0;
  private sentWaves = 0;      // waves of this game already sent
  private ended = true;       // the game already sent its ending (or there is no game)
  private lastT = -1;         // game second of the last send (don't repeat "left" with nothing new)
  private G: GameState | null = null;

  constructor() {
    if (!ENABLED) return;
    // on closing the tab or switching to another app (on mobile "pagehide" doesn't always fire)
    const leave = () => this.left();
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  }

  /** Start a new game. */
  start(G: GameState) {
    if (!ENABLED) return;
    this.left();   // in case the previous one was left unfinished
    this.G = G;
    this.session = uuid();
    this.seq = 0;
    this.sentWaves = 0;
    this.lastT = -1;
    this.ended = false;
  }

  /** Call every frame: sends when a wave ends and on losing. */
  update(G: GameState) {
    if (!ENABLED || this.ended || G !== this.G) return;
    if (G.over) { this.send('over'); this.ended = true; return; }
    if (G.stats.waves.length > this.sentWaves) this.send('wave');
  }

  /** The game is left unfinished (page closed, back to the menu…). */
  left() {
    if (!ENABLED || this.ended || !this.G) return;
    // on mobile "hidden" also fires when switching apps; if the player comes back, the game goes on and is sent later
    if (this.G.wave === 0) return;   // the first wave hadn't even started
    if (Math.round(this.G.t) === this.lastT) return;   // nothing new since the last send
    this.send('left');
  }

  private send(event: Event) {
    const G = this.G!;
    const waves = G.stats.waves.slice(this.sentWaves);
    this.sentWaves = G.stats.waves.length;
    this.lastT = Math.round(G.t);
    const row = {
      session: this.session,
      player: this.player,
      seq: this.seq++,
      event,
      version: __APP_VERSION__,
      difficulty: G.difficulty,
      wave: G.wave,
      seconds: Math.round(G.t),
      mobile: window.matchMedia('(pointer: coarse)').matches,
      screen: `${window.innerWidth}x${window.innerHeight}@${Math.round(window.devicePixelRatio * 100) / 100}`,
      platform: platform(),
      cheats: G.cheated,
      data: {
        waves,
        // snapshot of the moment (including the wave in progress)
        now: {
          baseHp: Math.ceil(G.base.hp), baseMax: G.base.max, coins: G.player.coins,
          towers: G.buildings.map(b => (b.type === 'archer' ? 'A' : 'C') + b.level).join(' '),
          towerMult: +G.towerMult.toFixed(2), helpers: G.helperLevels,
          enemiesAlive: G.enemies.length, built: G.built,
        },
        totals: {
          earned: G.stats.earned, spent: G.stats.spent, kills: G.stats.kills,
          baseDamage: G.stats.baseDamage, spawned: G.stats.spawned, spawnedKind: G.stats.spawnedKind,
        },
      },
    };
    // keepalive: the request goes through even while the page is closing
    fetch(`${SUPABASE.url}/rest/v1/game_logs`, {
      method: 'POST',
      headers: SUPABASE.headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      keepalive: true,
    }).catch(() => { /* offline: this chunk is lost, no big deal */ });
  }
}
