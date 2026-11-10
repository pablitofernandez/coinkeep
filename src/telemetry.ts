// ============================================================
//  Telemetría anónima de partidas (solo en la versión publicada).
//  Envía a Supabase (tabla game_logs, ver supabase/game_logs.sql) el
//  mismo registro por oleadas que devlog.ts guarda en local, para
//  equilibrar la dificultad con partidas reales.
//
//  - Al acabar cada oleada: solo las oleadas nuevas (filas pequeñas).
//  - Al perder: la última oleada y el resultado final.
//  - Al cerrar o dejar la pestaña: dónde lo dejó (para saber cuándo abandona la gente).
//  Sin nombres ni datos personales: un id aleatorio por partida y otro por navegador.
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

/** Sistema aproximado (sin el userAgent completo). */
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
  private sentWaves = 0;      // oleadas ya enviadas de esta partida
  private ended = true;       // la partida ya mandó su final (o no hay partida)
  private lastT = -1;         // segundo de partida del último envío (no repetir «left» sin novedades)
  private G: GameState | null = null;

  constructor() {
    if (!ENABLED) return;
    // al cerrar la pestaña o pasar a otra app (en el móvil no siempre llega «pagehide»)
    const leave = () => this.left();
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  }

  /** Empieza una partida nueva. */
  start(G: GameState) {
    if (!ENABLED) return;
    this.left();   // si la anterior quedó a medias
    this.G = G;
    this.session = uuid();
    this.seq = 0;
    this.sentWaves = 0;
    this.lastT = -1;
    this.ended = false;
  }

  /** Llamar cada fotograma: envía al acabar una oleada y al perder. */
  update(G: GameState) {
    if (!ENABLED || this.ended || G !== this.G) return;
    if (G.over) { this.send('over'); this.ended = true; return; }
    if (G.stats.waves.length > this.sentWaves) this.send('wave');
  }

  /** La partida se queda a medias (cierra la página, vuelve al menú…). */
  left() {
    if (!ENABLED || this.ended || !this.G) return;
    // en el móvil «hidden» también llega al cambiar de app; si vuelve, la partida sigue y se enviará después
    if (this.G.wave === 0) return;   // ni siquiera empezó la primera oleada
    if (Math.round(this.G.t) === this.lastT) return;   // nada nuevo desde el último envío
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
        // foto del momento (también con la oleada en curso a medias)
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
    // keepalive: el envío sigue aunque se esté cerrando la página
    fetch(`${SUPABASE.url}/rest/v1/game_logs`, {
      method: 'POST',
      headers: SUPABASE.headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      keepalive: true,
    }).catch(() => { /* sin conexión: se pierde este trozo, no pasa nada */ });
  }
}
