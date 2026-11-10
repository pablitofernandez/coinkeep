// ============================================================
//  Envío del registro de partida al servidor de desarrollo.
//  Solo funciona con `npm run dev` (en la versión final no hace nada).
//  Si el servidor no responde, el registro se guarda en localStorage
//  y se reenvía en cuanto vuelva a haber conexión.
// ============================================================
import type { GameState } from './game/types';

const ENABLED = import.meta.env.DEV;
const PENDING_KEY = 'sg-pending-logs';
const pad2 = (n: number) => String(n).padStart(2, '0');

type Payload = Record<string, unknown> & { session: string };

function readPending(): Record<string, Payload> {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}'); } catch { return {}; }
}
function writePending(p: Record<string, Payload>) {
  try {
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* sin almacenamiento */ }
}

export class DevLog {
  private session = '';
  private startedAt = '';
  private sentWaves = -1;
  private sentOver = false;
  /** Resultado del último envío (para el menú de desarrollo). */
  status = '';

  constructor() { if (ENABLED) this.flushPending(); }

  /** Empieza una sesión nueva (cada partida es un archivo distinto). */
  start() {
    const d = new Date();
    this.startedAt = d.toISOString();
    this.session = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}_${Math.random().toString(36).slice(2, 6)}`;
    this.sentWaves = -1;
    this.sentOver = false;
    if (ENABLED) this.flushPending();
  }

  /** Llamar cada frame: envía el registro cuando termina una oleada o la partida. */
  update(G: GameState) {
    if (!ENABLED) return;
    const n = G.stats.waves.length;
    if (n === this.sentWaves && G.over === this.sentOver) return;
    this.sentWaves = n;
    this.sentOver = G.over;
    if (n === 0 && !G.over) return;
    this.send(this.payload(G));
  }

  /** Envía el registro ahora mismo, aunque no haya terminado la oleada. */
  sendNow(G: GameState) {
    if (!ENABLED) return;
    this.send(this.payload(G));
  }

  /** Registros que no se pudieron enviar y esperan en el navegador. */
  pendingCount() { return Object.keys(readPending()).length; }

  private payload(G: GameState): Payload {
    return {
      session: this.session,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      // true si se usó el menú de desarrollo: estos datos no sirven para equilibrar
      cheats: G.cheated,
      device: {
        mobile: window.matchMedia('(pointer: coarse)').matches,
        screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
        userAgent: navigator.userAgent,
      },
      result: {
        over: G.over,
        waveReached: G.wave,
        seconds: Math.round(G.t),
        towers: G.buildings.length,
      },
      totals: {
        earned: G.stats.earned, spent: G.stats.spent, kills: G.stats.kills,
        baseDamage: G.stats.baseDamage, spawned: G.stats.spawned,
      },
      waves: G.stats.waves,
    };
  }

  private post(p: Payload) {
    return fetch('/__log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), keepalive: true })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); });
  }

  private send(p: Payload) {
    this.post(p).then(() => {
      // al enviarse, ya no hace falta la copia guardada de esta partida; y se aprovecha para mandar las atrasadas
      const pend = readPending();
      if (pend[p.session]) { delete pend[p.session]; writePending(pend); }
      this.status = 'Enviado ' + new Date().toLocaleTimeString();
      this.flushPending();
    }).catch(() => {
      // sin servidor: se guarda (la última versión de cada partida) para reenviarla después
      const pend = readPending();
      pend[p.session] = p;
      writePending(pend);
      this.status = 'Sin servidor: guardado en el navegador';
    });
  }

  private flushing = false;
  private flushPending() {
    if (this.flushing) return;
    const pend = readPending();
    const list = Object.values(pend);
    if (!list.length) return;
    this.flushing = true;
    Promise.allSettled(list.map(p => this.post(p).then(() => p.session))).then(res => {
      const left = readPending();
      for (const r of res) if (r.status === 'fulfilled') delete left[r.value];
      writePending(left);
      this.flushing = false;
    });
  }
}
