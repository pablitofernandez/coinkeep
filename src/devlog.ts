// ============================================================
//  Sends the game log to the development server.
//  Only works with `npm run dev` (does nothing in the final build).
//  If the server doesn't respond, the log is stored in localStorage
//  and resent as soon as there's a connection again.
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
  } catch { /* no storage */ }
}

export class DevLog {
  private session = '';
  private startedAt = '';
  private sentWaves = -1;
  private sentOver = false;
  /** Result of the last send (for the developer menu). */
  status = '';

  constructor() { if (ENABLED) this.flushPending(); }

  /** Start a new session (each game is a separate file). */
  start() {
    const d = new Date();
    this.startedAt = d.toISOString();
    this.session = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}_${Math.random().toString(36).slice(2, 6)}`;
    this.sentWaves = -1;
    this.sentOver = false;
    if (ENABLED) this.flushPending();
  }

  /** Call every frame: sends the log when a wave or the game ends. */
  update(G: GameState) {
    if (!ENABLED) return;
    const n = G.stats.waves.length;
    if (n === this.sentWaves && G.over === this.sentOver) return;
    this.sentWaves = n;
    this.sentOver = G.over;
    if (n === 0 && !G.over) return;
    this.send(this.payload(G));
  }

  /** Send the log right now, even if the wave hasn't finished. */
  sendNow(G: GameState) {
    if (!ENABLED) return;
    this.send(this.payload(G));
  }

  /** Logs that couldn't be sent and are waiting in the browser. */
  pendingCount() { return Object.keys(readPending()).length; }

  private payload(G: GameState): Payload {
    return {
      session: this.session,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      // true if the developer menu was used: this data is no good for balancing
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
      // once sent, the stored copy of this game is no longer needed; also a chance to send any backlog
      const pend = readPending();
      if (pend[p.session]) { delete pend[p.session]; writePending(pend); }
      this.status = 'Sent ' + new Date().toLocaleTimeString();
      this.flushPending();
    }).catch(() => {
      // no server: store it (the latest version of each game) to resend later
      const pend = readPending();
      pend[p.session] = p;
      writePending(pend);
      this.status = 'No server: saved in the browser';
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
