// ============================================================
//  Developer menu. Only loaded with `npm run dev`.
//  Opens with F1 or the º key (left of 1), and on mobile by
//  tapping the wave counter three times.
//  Any cheat marks the game as "cheated" in the log.
// ============================================================
import type { Sound } from '../audio';
import type { DevLog } from '../devlog';
import * as cheat from '../game/cheats';
import { ENEMY_KINDS } from '../config';
import type { DevFlags, EnemyKind, GameState, PadType, SfxName } from '../game/types';
import type { TimeControl } from '../main';
import type { View } from '../render/view';

export interface DevContext {
  game: () => GameState;
  view: View;
  sound: Sound;
  devlog: DevLog;
  time: TimeControl;
  restart: () => void;
  fps: () => number;
  simMs: () => number;
}

const SFX: [SfxName, string][] = [
  ['sword', 'Sword'], ['bow', 'Crossbow'], ['arrow', 'Tower arrow'], ['cannon', 'Cannon'], ['boom', 'Explosion'],
  ['die', 'Zombie death'], ['dieBones', 'Skeleton death'], ['dieBat', 'Bat death'], ['heal', 'Mage heal'], ['bossDie', 'Boss death'], ['bite', 'Bite'], ['coin', 'Coin'], ['pay', 'Pay'],
  ['build', 'Build'], ['upgrade', 'Upgrade'], ['baseHit', 'Castle hit'], ['wave', 'Wave'], ['boss', 'Boss'],
  ['waveClear', 'Wave cleared'], ['gameOver', 'Defeat'],
];

/** Readable names for the log keys. */
const NAMES: Record<string, string> = {
  ground: 'ground', table: 'tables', dog: 'wolves', peon: 'peons',
  sword: 'sword', bow: 'crossbow', archer: 'archers', cannon: 'cannons',
  power: 'strength', repair: 'repair', forge: 'forge', kennel: 'wolves', upgrade: 'upgrades',
  zombie: 'warriors', runner: 'minions', bat: 'bats', shaman: 'mages', boss: 'bosses',
};

const REPEATABLE: [PadType, string][] = [
  ['power', '💪 Strength'], ['forge', '🔨 Forge'], ['kennel', '🐺 Wolves'], ['peon', '🧔 Peons'], ['repair', '🏰 Repair'],
];

export function initDevPanel(ctx: DevContext) {
  const G = () => ctx.game();
  const refreshers: (() => void)[] = [];
  const onRefresh = (f: () => void) => { refreshers.push(f); };

  // ---------- structure ----------
  const root = el('div', 'dev-panel hidden');
  root.id = 'dev';
  // so touching the menu doesn't move the joystick or restart the game
  for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) root.addEventListener(ev, e => e.stopPropagation());
  document.body.appendChild(root);

  const head = el('div', 'dev-head');
  const title = el('div', 'dev-title', '🛠 Developer');
  const close = el('button', 'dev-close', '✕');
  close.addEventListener('click', () => toggle(false));
  head.append(title, close);
  const stats = el('div', 'dev-stats');
  const cheatBadge = el('div', 'dev-badge', '');
  root.append(head, stats, cheatBadge);
  const body = el('div', 'dev-body');
  root.appendChild(body);

  /** Runs a cheat and refreshes the menu. */
  const act = (f: () => void) => () => { f(); G().cheated = true; refresh(); };

  // ---------- UI pieces ----------
  function section(name: string, open = false) {
    const d = el('details', 'dev-sec') as HTMLDetailsElement;
    d.open = open;
    d.appendChild(el('summary', '', name));
    body.appendChild(d);
    return d;
  }
  function row(parent: HTMLElement, label?: string) {
    const r = el('div', 'dev-row');
    if (label) r.appendChild(el('span', 'dev-label', label));
    parent.appendChild(r);
    return r;
  }
  function button(parent: HTMLElement, text: string, f: () => void, cls = '') {
    const b = el('button', 'dev-btn ' + cls, text);
    b.addEventListener('click', act(f));
    parent.appendChild(b);
    return b;
  }
  /** Toggle bound to a G.dev cheat (re-read on every refresh: a new game turns them off). */
  function flag(parent: HTMLElement, text: string, key: { [K in keyof DevFlags]: DevFlags[K] extends boolean ? K : never }[keyof DevFlags]) {
    const b = el('button', 'dev-btn dev-toggle', text);
    b.addEventListener('click', act(() => { G().dev[key] = !G().dev[key]; }));
    parent.appendChild(b);
    onRefresh(() => b.classList.toggle('on', G().dev[key]));
    return b;
  }
  /** Mutually exclusive option buttons (multipliers). */
  function choices(parent: HTMLElement, values: number[], get: () => number, set: (v: number) => void, fmt = (v: number) => '×' + v) {
    const bs = values.map(v => {
      const b = el('button', 'dev-btn dev-choice', fmt(v));
      b.addEventListener('click', act(() => set(v)));
      parent.appendChild(b);
      return b;
    });
    onRefresh(() => bs.forEach((b, i) => b.classList.toggle('on', Math.abs(get() - values[i]) < 1e-6)));
  }
  function numberInput(parent: HTMLElement, value: number, min = 1) {
    const i = el('input', 'dev-num') as HTMLInputElement;
    i.type = 'number'; i.min = String(min); i.value = String(value);
    parent.appendChild(i);
    return i;
  }
  function info(parent: HTMLElement, f: () => string) {
    const s = el('span', 'dev-info');
    parent.appendChild(s);
    onRefresh(() => { const t = f(); if (s.textContent !== t) s.textContent = t; });
    return s;
  }

  // ======================================================
  //  🧟 Enemies and waves
  // ======================================================
  {
    const s = section('🧟 Enemies and waves', true);
    let r = row(s, 'Type');
    const kindSel = el('select', 'dev-select') as HTMLSelectElement;
    for (const [v, t] of [['', 'Wave mix'], ...Object.entries(ENEMY_KINDS).map(([k, d]) => [k, d.name])]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; kindSel.appendChild(o);
    }
    r.appendChild(kindSel);
    const kind = () => (kindSel.value || undefined) as EnemyKind | undefined;
    r = row(s, 'From the forest');
    for (const n of [1, 10, 50, 200]) button(r, '+' + n, () => cheat.spawnMany(G(), n, 'forest', false, kind()));
    r = row(s, 'Near you');
    for (const n of [1, 10, 50, 200]) button(r, '+' + n, () => cheat.spawnMany(G(), n, 'near', false, kind()));
    r = row(s, 'Boss');
    button(r, 'In the forest', () => cheat.spawnMany(G(), 1, 'forest', true));
    button(r, 'Near you', () => cheat.spawnMany(G(), 1, 'near', true));
    r = row(s, 'Jump to wave');
    const waveIn = numberInput(r, 10);
    button(r, 'Go', () => cheat.jumpToWave(G(), +waveIn.value || 1));
    r = row(s);
    button(r, 'Next wave now', () => cheat.nextWaveNow(G()));
    flag(r, 'Pause countdown', 'pauseWaves');
    r = row(s);
    button(r, 'Kill all', () => cheat.killAll(G(), false));
    button(r, 'Kill (drop coins)', () => cheat.killAll(G(), true));
    flag(r, 'Freeze', 'freeze');
    r = row(s, 'HP of new ones');
    choices(r, [0.25, 0.5, 1, 2, 5, 10], () => G().dev.enemyHp, v => { G().dev.enemyHp = v; });
    r = row(s, 'Speed');
    choices(r, [0.5, 1, 2, 3], () => G().dev.enemySpeed, v => { G().dev.enemySpeed = v; });
  }

  // ======================================================
  //  🏰 Castle and player
  // ======================================================
  {
    const s = section('🏰 Castle and player');
    let r = row(s, 'Castle HP');
    button(r, 'Fill', () => cheat.setBaseHp(G(), G().base.max));
    button(r, 'To 1', () => cheat.setBaseHp(G(), 1));
    flag(r, 'Invulnerable', 'godCastle');
    info(r, () => `${Math.ceil(G().base.hp)}/${G().base.max}`);
    r = row(s, 'Castle level');
    button(r, '−', () => cheat.setCastleLevel(G(), G().castleLevel - 1));
    info(r, () => `Lv ${G().castleLevel}`);
    button(r, '+', () => cheat.setCastleLevel(G(), G().castleLevel + 1));
    r = row(s, 'Rogue damage');
    choices(r, [0, 1, 10, 100], () => G().dev.playerDmg, v => { G().dev.playerDmg = v; });
    r = row(s, 'Rogue speed');
    choices(r, [1, 2, 3], () => G().dev.playerSpeed, v => { G().dev.playerSpeed = v; });
    r = row(s, 'Teleport');
    button(r, 'To the castle', () => cheat.teleport(G(), cheat.castleFront()));
    const sel = el('select', 'dev-select') as HTMLSelectElement;
    r.appendChild(sel);
    sel.addEventListener('change', () => {
      const pad = G().pads.find(p => String(p.id) === sel.value);
      if (pad) { cheat.teleport(G(), { x: pad.x, y: pad.y + 1.1 }); refresh(); }
      sel.value = '';
    });
    onRefresh(() => {
      const pads = G().pads.filter(p => p.active);
      const key = pads.map(p => p.id).join(',');
      if (sel.dataset.key === key) return;
      sel.dataset.key = key;
      sel.innerHTML = '<option value="">To a plot…</option>' +
        pads.map(p => `<option value="${p.id}">${padName(p.type)} (${p.cost})</option>`).join('');
    });
  }

  // ======================================================
  //  💰 Economy
  // ======================================================
  {
    const s = section('💰 Economy');
    let r = row(s, 'Coins');
    for (const n of [100, 1000, 10000]) button(r, '+' + n.toLocaleString('en'), () => cheat.addCoins(G(), n));
    r = row(s);
    flag(r, 'Infinite money', 'infiniteMoney');
    flag(r, 'Free building', 'freeBuild');
    r = row(s);
    button(r, 'Show all plots', () => cheat.unlockAllPads(G()));
    flag(r, '🤖 Autopilot', 'autoplay');
    s.appendChild(el('p', 'dev-note', 'Autopilot: instantly collects all the money and buys the cheapest plot it can afford.'));
  }

  // ======================================================
  //  🏗️ Building
  // ======================================================
  {
    const s = section('🏗️ Building');
    let r = row(s, 'Towers');
    button(r, 'Build visible ones', () => cheat.buildAllTowers(G()));
    button(r, 'Build ALL', () => cheat.buildAllTowers(G(), true));
    button(r, 'All to max level', () => cheat.maxAllTowers(G()));
    for (const [type, name] of REPEATABLE) {
      r = row(s, name);
      info(r, () => `Lv ${cheat.padLevel(G(), type)}`);
      button(r, '+1', () => cheat.levelUp(G(), type, 1));
      button(r, '+5', () => cheat.levelUp(G(), type, 5));
    }
  }

  // ======================================================
  //  ⏱️ Time
  // ======================================================
  {
    const s = section('⏱️ Time');
    let r = row(s, 'Speed');
    choices(r, [0.25, 0.5, 1, 2, 4, 8], () => ctx.time.scale, v => { ctx.time.scale = v; ctx.time.paused = false; });
    r = row(s);
    const pause = button(r, '⏸ Pause', () => { ctx.time.paused = !ctx.time.paused; }, 'dev-toggle');
    onRefresh(() => { pause.classList.toggle('on', ctx.time.paused); pause.textContent = ctx.time.paused ? '▶ Resume' : '⏸ Pause'; });
    button(r, '⏭ One step', () => { ctx.time.paused = true; ctx.time.stepOnce = true; });
    r = row(s, 'Simulate to wave');
    const simIn = numberInput(r, 20);
    const simBtn = button(r, 'Simulate', () => {
      if (ctx.time.turboTo > 0) { ctx.time.turboTo = 0; ctx.time.turboNote = 'Simulation stopped'; return; }
      ctx.time.turboNote = '';
      ctx.time.turboTo = Math.max(G().wave + 1, +simIn.value || 1);
    });
    onRefresh(() => { simBtn.textContent = ctx.time.turboTo > 0 ? `Stop (wave ${G().wave})` : 'Simulate'; });
    r = row(s);
    info(r, () => ctx.time.turboNote);
    s.appendChild(el('p', 'dev-note', 'Simulates at full speed with the autopilot buying, without you moving the rogue. Useful to see how the economy scales.'));
    r = row(s);
    button(r, '🔄 New game', () => { ctx.restart(); ctx.time.turboTo = 0; });
  }

  // ======================================================
  //  👁️ Display
  // ======================================================
  {
    const s = section('👁️ Display');
    let r = row(s, 'Draw');
    const dbg = ctx.view.debug.opts;
    for (const [key, name] of [['colliders', 'Colliders'], ['ranges', 'Ranges'], ['paths', 'Helper paths']] as const) {
      const b = el('button', 'dev-btn dev-toggle', name);
      b.addEventListener('click', () => { dbg[key] = !dbg[key]; refresh(); });
      r.appendChild(b);
      onRefresh(() => b.classList.toggle('on', dbg[key]));
    }
    r = row(s, 'Camera zoom');
    const zoom = el('input', 'dev-range') as HTMLInputElement;
    zoom.type = 'range'; zoom.min = '0.3'; zoom.max = '2.5'; zoom.step = '0.05'; zoom.value = '1';
    zoom.addEventListener('input', () => ctx.view.setZoom(+zoom.value));
    r.appendChild(zoom);
    const zr = el('button', 'dev-btn', 'Reset');
    zr.addEventListener('click', () => { zoom.value = '1'; ctx.view.setZoom(1); });
    r.appendChild(zr);
    r = row(s);
    button(r, '🌲 Regenerate scenery', () => cheat.regenProps(G()));
    s.appendChild(el('p', 'dev-note', 'Red: obstacles · Pink: castle · Green: rogue · Orange: zombies · Blue: helpers. Ranges: white sword, light blue crossbow, yellow archers, orange cannons.'));
  }

  // ======================================================
  //  🔊 Audio
  // ======================================================
  {
    const s = section('🔊 Audio');
    const grid = el('div', 'dev-grid');
    s.appendChild(grid);
    for (const [name, label] of SFX) {
      const b = el('button', 'dev-btn', label);
      b.addEventListener('click', () => ctx.sound.test(name));   // listening doesn't count as cheating
      grid.appendChild(b);
    }
    for (const [label, set, get] of [
      ['Effects', (v: number) => ctx.sound.setSfxVolume(v), () => 1],
      ['Music', (v: number) => ctx.sound.music.setVolume(v), () => ctx.sound.music.volume],
    ] as const) {
      const r = row(s, label);
      const sl = el('input', 'dev-range') as HTMLInputElement;
      sl.type = 'range'; sl.min = '0'; sl.max = '1.5'; sl.step = '0.05'; sl.value = String(get());
      sl.addEventListener('input', () => set(+sl.value));
      r.appendChild(sl);
    }
    s.appendChild(el('p', 'dev-note', 'If nothing plays, click in the game first (the browser won\'t play audio without a click).'));
  }

  // ======================================================
  //  📊 Data
  // ======================================================
  {
    const s = section('📊 Game data');
    const table = el('div', 'dev-data');
    s.appendChild(table);
    onRefresh(() => {
      if (!(s as HTMLDetailsElement).open) return;
      const g = G(), w = cheat.liveWave(g), st = g.stats;
      const kv = (o: Record<string, number>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${NAMES[k] ?? k} ${v}`).join(' · ') || '—';
      const html =
        `<b>Wave ${g.wave} in progress</b> (${w.seconds} s)<br>` +
        `Earned: ${kv(w.earned)}<br>Spent: ${kv(w.spent)}<br>Kills: ${kv(w.kills)}<br>` +
        `Castle damage: ${w.baseDamage} · Enemies spawned: ${w.spawned} (${kv(w.spawnedKind)})<br><br>` +
        `<b>Total</b> (${Math.round(g.t)} s)<br>` +
        `Earned: ${kv(st.earned)}<br>Spent: ${kv(st.spent as Record<string, number>)}<br>Kills: ${kv(st.kills)}<br>` +
        `Towers: ${g.buildings.map(b => (b.type === 'archer' ? 'A' : 'C') + b.level).join(' ') || '—'}<br>` +
        `Forge ×${g.towerMult.toFixed(2)} · Sword ${(g.player.swordDmg * g.towerMult).toFixed(1)} · Crossbow ${(g.player.bowDmg * g.towerMult).toFixed(1)}<br>` +
        `Coins: in hand ${g.player.coins} · ground ${g.drops.reduce((a, c) => a + c.worth, 0)} · tables ${g.buildings.reduce((a, b) => a + b.table, 0)}`;
      if (table.innerHTML !== html) table.innerHTML = html;
    });
    const r = row(s);
    const send = el('button', 'dev-btn', '📤 Send log now');
    send.addEventListener('click', () => { ctx.devlog.sendNow(G()); setTimeout(refresh, 400); });
    r.appendChild(send);
    info(r, () => {
      const n = ctx.devlog.pendingCount();
      return [ctx.devlog.status, n ? `${n} log(s) waiting in the browser` : ''].filter(Boolean).join(' · ');
    });
  }

  // ---------- periodic refresh (only while the menu is open) ----------
  const view = ctx.view;
  function refresh() {
    const g = G();
    const info = view.renderer.info.render;
    const t = ctx.view.timing;
    stats.textContent =
      `${Math.round(ctx.fps())} FPS · ms per frame: simulation ${ctx.simMs().toFixed(1)} · 3D ${t.gl.toFixed(1)} · labels ${t.labels.toFixed(1)} · ` +
      `${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k triangles · ` +
      `${g.enemies.length} enemies · ${g.shots.length} shots · ${g.drops.length} coins · ${g.helpers.length} helpers`;
    cheatBadge.textContent = g.cheated ? '⚠ Cheated game: the log will be flagged' : '';
    for (const f of refreshers) f();
  }
  let timer = 0;
  function toggle(open = root.classList.contains('hidden')) {
    root.classList.toggle('hidden', !open);
    clearInterval(timer);
    if (open) { refresh(); timer = window.setInterval(refresh, 250); }
  }

  // ---------- opening ----------
  // in the capture phase and stopping propagation: the key must not reach the game (it would restart after losing)
  window.addEventListener('keydown', e => {
    if (e.key === 'F1' || e.code === 'Backquote' || e.key === 'º') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) toggle();
    }
  }, true);
  // mobile: three quick taps on the wave counter
  const waveEl = document.querySelector('.hud-center') as HTMLElement | null;
  if (waveEl) {
    waveEl.style.pointerEvents = 'auto';
    let taps: number[] = [];
    waveEl.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const now = performance.now();
      taps = taps.filter(t => now - t < 700);
      taps.push(now);
      if (taps.length >= 3) { taps = []; toggle(); }
    });
  }
}

// ------------------------------------------------------------
function el(tag: string, cls = '', text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function padName(t: PadType) {
  return ({ archer: '🏹 Archer', cannon: '💣 Cannon', power: '💪 Strength', repair: '🏰 Repair', forge: '🔨 Forge', kennel: '🐺 Wolf', peon: '🧔 Peon', upgrade: '⬆ Tower upgrade' } as Record<PadType, string>)[t];
}
