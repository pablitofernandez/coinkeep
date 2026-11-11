import { autopilotDir, showcase, showcaseTick } from './game/cheats';
import { createGame, pickCard, rerollCards, step } from './game/sim';
import { CARDS, CARD_IDS, rerollCost } from './game/cards';
import type { Difficulty, GameState, Vec } from './game/types';
import { DIFFICULTIES } from './config';
import { cleanName, leaderboardEnabled, rankOf, savedName, submitScore, topScores, type Score } from './leaderboard';
import { Sound } from './audio';
import { DevLog } from './devlog';
import { Telemetry } from './telemetry';
import { Input, isTyping, preventBrowserZoom } from './input';
import { loadAssets } from './render/assets';
import { CAM_ELEVATION_SIN, View, fmt } from './render/view';
import { LANGS, applyStatic, getLang, setLang, t } from './i18n';
import { LATEST_VERSION, changelogHtml, hasUnseenNews, markNewsSeen } from './news';

const $ = (id: string) => document.getElementById(id)!;

// no browser zoom on mobile (double tap or pinch): the game fills the whole screen
preventBrowserZoom();

// texts of index.html in the player's language (before loading, so «Loading…» is already translated)
applyStatic();

// --- load the 3D models (before creating the scene)
const loading = $('loading');
await loadAssets(k => { loading.textContent = t('loading.pct', { pct: Math.round(k * 100) }); });
loading.remove();

const view = new View($('app'));
const input = new Input(document.body, $('joy'), $('joy-knob'));
const devlog = new DevLog();
const telemetry = new Telemetry();   // anonymous stats from the published version (for balancing)

// --- title screen: in the background, a showcase game (towers, wolves, zombies) with the camera orbiting
let G: GameState = createGame();
showcase(G);
view.reset(G);
let inTitle = true;
document.body.classList.add('title-mode');
$('title').classList.remove('hidden');
view.orbit = Math.PI / 4;
view.setZoom(0.85);

// --- difficulty (remembered between games)
let difficulty: Difficulty = (() => {
  try { const d = localStorage.getItem('sg-diff') as Difficulty; return DIFFICULTIES.includes(d) ? d : 'normal'; } catch { return 'normal'; }
})();
/** Keep button clicks from moving the joystick or starting the game. */
const guard = (el: HTMLElement) => el.addEventListener('pointerdown', e => e.stopPropagation());
const diffBox = $('diff');
for (const d of DIFFICULTIES) {
  const b = document.createElement('button');
  b.className = 'menu-btn'; b.textContent = t(`diff.${d}`); b.dataset.d = d;
  b.setAttribute('role', 'radio');
  guard(b);
  b.addEventListener('click', () => {
    difficulty = d;
    try { localStorage.setItem('sg-diff', d); } catch { /* no storage */ }
    showDifficulty();
    if (!$('board').classList.contains('hidden')) void showBoard();
  });
  diffBox.appendChild(b);
}
function showDifficulty() {
  for (const b of diffBox.children as HTMLCollectionOf<HTMLElement>) {
    b.classList.toggle('on', b.dataset.d === difficulty);
    b.setAttribute('aria-checked', String(b.dataset.d === difficulty));
  }
}
showDifficulty();

// --- language (follows the system; the ES | EN picker on the title screen overrides it)
const langBox = $('lang');
for (const l of LANGS) {
  const b = document.createElement('button');
  b.className = 'menu-btn'; b.textContent = l.toUpperCase(); b.dataset.l = l;
  b.setAttribute('role', 'radio');
  guard(b);
  b.addEventListener('click', () => { setLang(l); showLang(); });
  langBox.appendChild(b);
}
/** Re-render every text on screen in the current language. */
function showLang() {
  applyStatic();
  for (const b of langBox.children as HTMLCollectionOf<HTMLElement>) {
    b.classList.toggle('on', b.dataset.l === getLang());
    b.setAttribute('aria-checked', String(b.dataset.l === getLang()));
  }
  for (const b of diffBox.children as HTMLCollectionOf<HTMLElement>) b.textContent = t(`diff.${b.dataset.d as Difficulty}`);
  if (!$('board').classList.contains('hidden')) void showBoard();
  if (!$('news').classList.contains('hidden')) showNews();
}
showLang();

// --- global leaderboard
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Render a list of scores (with textContent: names are typed in by players). */
function fillList(list: HTMLElement, scores: Score[], me?: Score, myRank?: number) {
  list.replaceChildren();
  const item = (pos: string, who: string, score: string, mine: boolean) => {
    const li = document.createElement('li');
    if (mine) li.className = 'me';
    for (const [cls, t] of [['pos', pos], ['who', who], ['score', score]]) {
      const sp = document.createElement('span'); sp.className = cls; sp.textContent = t; li.appendChild(sp);
    }
    list.appendChild(li);
  };
  let shown = false;
  scores.forEach((s, i) => {
    const mine = !!me && !shown && myRank === i + 1 && s.name === me.name && s.wave === me.wave && s.seconds === me.seconds;
    if (mine) shown = true;
    item(`${i + 1}.`, s.name, t('board.row', { wave: s.wave, time: fmtTime(s.seconds) }), mine);
  });
  if (me && myRank && !shown) item(`${myRank}.`, me.name, t('board.row', { wave: me.wave, time: fmtTime(me.seconds) }), true);
  if (!scores.length && !me) boardMessage(list, t('board.empty'));
}
function boardMessage(list: HTMLElement, text: string) {
  const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; list.replaceChildren(li);
}
async function showBoard() {
  const list = $('board-list');
  $('news').classList.add('hidden');
  $('board').classList.remove('hidden');
  $('board-diff').textContent = t(`diff.${difficulty}`);
  boardMessage(list, t('loading'));
  try { fillList(list, await topScores(difficulty)); } catch { boardMessage(list, t('board.loadError')); }
}
for (const id of ['show-board', 'board-close', 'board']) guard($(id));
$('show-board').addEventListener('click', () => void showBoard());
$('board-close').addEventListener('click', () => $('board').classList.add('hidden'));
if (!leaderboardEnabled) $('show-board').classList.add('hidden');

// --- "What's new": the changelog (CHANGELOG.md / CHANGELOG.es.md), with a dot when there's an unseen version
function showNews() {
  $('board').classList.add('hidden');
  $('news').classList.remove('hidden');
  $('news-version').textContent = 'v' + LATEST_VERSION;
  $('news-body').innerHTML = changelogHtml();   // our own Markdown file, escaped by changelogHtml()
  $('news-dot').classList.add('hidden');
  markNewsSeen();
}
for (const id of ['show-news', 'news-close', 'news']) guard($(id));
$('show-news').addEventListener('click', showNews);
$('news-close').addEventListener('click', () => $('news').classList.add('hidden'));
if (hasUnseenNews()) $('news-dot').classList.remove('hidden');

/** Leave the title screen and start the real game. */
function startGame() {
  if (!inTitle) return;
  inTitle = false;
  const title = $('title');
  title.classList.add('leaving');
  setTimeout(() => title.classList.add('hidden'), 450);
  document.body.classList.remove('title-mode');
  view.orbit = null;
  view.setZoom(1);
  restart();
}

// --- sound (🔊 button or M key)
const sound = new Sound();
const muteBtn = $('mute');
const showMute = (m: boolean) => { muteBtn.textContent = m ? '🔇' : '🔊'; };
showMute(sound.muted);
sound.onMuteChange = showMute;
muteBtn.addEventListener('pointerdown', e => e.stopPropagation());   // don't move the joystick
muteBtn.addEventListener('click', () => sound.toggleMute());
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.repeat && !isTyping(e)) sound.toggleMute(); });

// --- music (button or N key)
const musicBtn = $('music');
const showMusic = (on: boolean) => musicBtn.classList.toggle('off', !on);
showMusic(sound.music.enabled);
sound.music.onChange = showMusic;
musicBtn.addEventListener('pointerdown', e => e.stopPropagation());
musicBtn.addEventListener('click', () => sound.music.toggle());
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'n' && !e.repeat && !isTyping(e)) sound.music.toggle(); });

window.addEventListener('resize', () => view.resize());

function restart() {
  G = createGame(difficulty);
  view.reset(G);
  devlog.start();
  telemetry.start(G);
  $('gameover').classList.add('hidden');
}

/** Go back to the title screen (to change difficulty or view the leaderboard). */
function backToTitle() {
  G = createGame();
  showcase(G);
  view.reset(G);
  inTitle = true;
  document.body.classList.add('title-mode');
  $('title').classList.remove('hidden', 'leaving');
  $('board').classList.add('hidden');
  $('news').classList.add('hidden');
  $('gameover').classList.add('hidden');
  view.orbit = Math.PI / 4;
  view.setZoom(0.85);
}
input.onAny = () => { if (inTitle) startGame(); };

// --- game over: save your record with your name and view the leaderboard
guard($('gameover'));
$('go-again').addEventListener('click', () => restart());
$('go-menu').addEventListener('click', () => backToTitle());
// Enter or Space also retry (unless you're typing your name)
window.addEventListener('keydown', e => {
  if (!G.over || inTitle || isTyping(e) || e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restart(); }
});
let finalScore: Score | null = null;
async function onGameOver() {
  const form = $('go-form'), msg = $('go-msg'), list = $('go-list');
  list.replaceChildren(); msg.textContent = '';
  const score: Score = { name: '', wave: G.wave, seconds: Math.round(G.t), difficulty: G.difficulty };
  finalScore = score;
  $('go-text').textContent = t('over.summary', { diff: t(`diff.${G.difficulty}`), wave: G.wave, time: fmtTime(score.seconds), towers: G.buildings.length });
  const canSubmit = leaderboardEnabled && !G.cheated && G.wave >= 1;
  form.classList.toggle('hidden', !canSubmit);
  if (!leaderboardEnabled) return;
  if (G.cheated) msg.textContent = t('over.cheated');
  try {
    const [top, rank] = await Promise.all([topScores(score.difficulty), rankOf(score)]);
    if (finalScore !== score) return;   // another game has already started
    fillList(list, top);
    if (!canSubmit) return;
    msg.textContent = t(rank <= 10 ? 'over.wouldEnter' : 'over.wouldBe', { rank });
    const name = $('go-name') as HTMLInputElement;
    name.value = savedName();
    if (!matchMedia('(pointer: coarse)').matches) name.focus();
  } catch { msg.textContent = t('over.connectError'); }
}
$('go-form').addEventListener('submit', async e => {
  e.preventDefault();
  const field = $('go-name') as HTMLInputElement, send = $('go-send') as HTMLButtonElement, msg = $('go-msg');
  const name = cleanName(field.value);
  if (!finalScore || !name) { msg.textContent = t('over.needName'); field.focus(); return; }
  send.disabled = true; msg.textContent = t('over.saving');
  try {
    const me = { ...finalScore, name };
    await submitScore(me);
    finalScore = null;   // only once per game
    const [top, rank] = await Promise.all([topScores(me.difficulty), rankOf(me)]);
    fillList($('go-list'), top, me, rank);
    msg.textContent = t('over.saved', { rank, diff: t(`diff.${me.difficulty}`) });
    $('go-form').classList.add('hidden');
    field.blur();
  } catch { msg.textContent = t('over.saveError'); }
  send.disabled = false;
});

/**
 * Convert a screen direction into a ground direction.
 * With the camera at (+x, +y, +z): screen right = (1, -1)/√2 and
 * down = (1, 1)/√2, the latter foreshortened by the camera tilt.
 */
function screenToWorld(s: Vec): Vec {
  const mag = Math.hypot(s.x, s.y);
  if (mag === 0) return { x: 0, y: 0 };
  const sy = s.y / CAM_ELEVATION_SIN;
  const wx = (s.x + sy) / Math.SQRT2, wy = (sy - s.x) / Math.SQRT2;
  const wm = Math.hypot(wx, wy);
  return { x: wx / wm * mag, y: wy / wm * mag };
}

// --- HUD (the DOM is only touched when something changes: touching it every frame heats up phones)
const hud = { cards: $('hud-cards'), coins: $('hud-coins'), wave: $('hud-wave'), sub: $('hud-sub'), hp: $('hud-hp'), hpText: $('hud-hp-text'), help: $('help') };
const cache = new Map<HTMLElement, string>();
const setText = (el: HTMLElement, v: string) => { if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; } };
const setStyle = (el: HTMLElement, prop: 'width' | 'opacity', v: string) => {
  const k = prop + v; if (cache.get(el) !== k) { cache.set(el, k); el.style[prop] = v; }
};
let lastOver = false;
// --- cards: every few waves the game pauses and offers 3 (src/game/cards.ts)
const cardsBox = $('cards'), cardHand = $('card-hand'), rerollBtn = $('card-reroll') as HTMLButtonElement;
let shownOffer = '';
guard(cardsBox);
/** Show (or hide) the hand on offer. Only rebuilt when the offer changes. */
function updateCards() {
  const offer = G.offer;
  const key = offer ? offer.ids.join(',') + '|' + offer.rerolls + '|' + getLang() : '';
  if (key !== shownOffer) {
    shownOffer = key;
    cardsBox.classList.toggle('hidden', !offer);
    cardHand.replaceChildren();
    if (offer) {
      offer.ids.forEach((id, i) => {
        const def = CARDS[id], have = G.cards[id] ?? 0;
        const b = document.createElement('button');
        b.className = 'card ' + def.rarity;
        const parts: [string, string][] = [
          ['card-key', String(i + 1)], ['card-icon', def.icon], ['card-name', t(`card.${id}.name`)],
          ['card-rarity', t(`rarity.${def.rarity}`)], ['card-desc', t(`card.${id}.desc`)], ['card-owned', have ? t('cards.owned', { n: have }) : ''],
        ];
        for (const [cls, text] of parts) { const el = document.createElement('span'); el.className = cls; el.textContent = text; b.appendChild(el); }
        b.addEventListener('click', () => choose(i));
        cardHand.appendChild(b);
      });
    }
  }
  if (offer) {
    const cost = rerollCost(G);
    setText(rerollBtn, t('cards.reroll', { cost }));
    rerollBtn.disabled = G.player.coins < cost;
    rerollBtn.classList.toggle('hidden', !!offer.preview);   // dev menu preview: nothing to reroll
  }
}
function choose(i: number) {
  const id = G.offer?.ids[i];
  if (id) pickCard(G, id);
  updateCards();
}
rerollBtn.addEventListener('click', () => { rerollCards(G); updateCards(); });
window.addEventListener('keydown', e => {
  if (!G.offer || inTitle || isTyping(e) || e.repeat) return;
  if (e.key >= '1' && e.key <= '3') { e.preventDefault(); choose(Number(e.key) - 1); }
  if (e.key.toLowerCase() === 'r') { e.preventDefault(); rerollCards(G); updateCards(); }
});
/** Cards held, as a row of icons under the wave counter. */
function cardsRow() {
  return CARD_IDS.filter(id => G.cards[id]).map(id => CARDS[id].icon + ((G.cards[id] ?? 0) > 1 ? '×' + G.cards[id] : '')).join(' ');
}

function updateHud() {
  setText(hud.coins, fmt(G.player.coins));
  setText(hud.wave, G.wave ? t('hud.wave', { n: G.wave }) : t('hud.ready'));
  setText(hud.sub, t('hud.next', { s: Math.ceil(G.waveTimer), n: G.enemies.length }));
  setText(hud.cards, cardsRow());
  updateCards();
  setStyle(hud.hp, 'width', Math.round(G.base.hp / G.base.max * 100) + '%');
  setText(hud.hpText, `🏰 ${Math.ceil(G.base.hp)}/${G.base.max}`);
  setStyle(hud.help, 'opacity', Math.max(0, Math.min(1, (10 - G.t) / 2)).toFixed(2));
  if (G.over && !lastOver) {
    $('gameover').classList.remove('hidden');
    void onGameOver();
  }
  lastOver = G.over;
}

// --- time control (used by the developer menu)
export interface TimeControl {
  scale: number;          // game speed (1 = normal)
  paused: boolean;
  stepOnce: boolean;      // advance a single step while paused
  turboTo: number;        // > 0: simulate flat out (with autopilot) up to this wave
  turboNote: string;      // result of the last fast simulation
}
const time: TimeControl = { scale: 1, paused: false, stepOnce: false, turboTo: 0, turboNote: '' };

// --- main loop (fixed step so the simulation stays stable)
// Capped at ~60 fps: on 120 Hz screens the browser would ask for twice as many frames.
// The threshold has a lot of slack (10 ms, not 16.7): with a tight one, a frame that arrived a
// hair early was skipped entirely and the game stuttered at 30 fps (noticeable on iPhone).
// At 120 Hz every other frame is drawn (60 fps); at 60 Hz, all of them; at 90 Hz, all of them.
const FIXED = 1 / 60;
const MIN_FRAME_MS = 10;
let acc = 0, last = performance.now();
let fps = 60, fpsFrames = 0, fpsT = performance.now();
let simMs = 0;   // simulation time per frame (smoothed average), for the developer menu
function frame(now: number) {
  requestAnimationFrame(frame);
  if (now - last < MIN_FRAME_MS) return;
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // On a 60 Hz screen the frame time wobbles around 16.7 ms. With the raw value the fixed-step loop
  // sometimes ran 0 steps and then 2: a visible hitch at a steady 60 fps. Close enough counts as one step.
  if (Math.abs(dt - FIXED) < 0.002) dt = FIXED;
  fpsFrames++;
  if (now - fpsT >= 500) { fps = fpsFrames * 1000 / (now - fpsT); fpsFrames = 0; fpsT = now; }
  if (inTitle) {
    // title screen: the showcase scene keeps running (no sound, no HUD and no logging)
    view.orbit = (view.orbit ?? 0) + dt * 0.1;
    acc += dt;
    while (acc >= FIXED) { step(G, FIXED, { x: 0, y: 0 }); showcaseTick(G); acc -= FIXED; }
    view.render(G, dt);
    updateCards();   // the dev menu can preview cards from here too
    return;
  }
  const dir = screenToWorld(input.screenDir());
  let simDt = dt * time.scale;
  if (time.turboTo > 0) turbo();
  else if (time.paused) {
    simDt = 0;
    if (time.stepOnce) { step(G, FIXED, dir); simDt = FIXED; time.stepOnce = false; }
    acc = 0;
  } else {
    const t0 = performance.now();
    acc += simDt;
    while (acc >= FIXED) { step(G, FIXED, dir); acc -= FIXED; }
    simMs += (performance.now() - t0 - simMs) * 0.1;
  }
  sound.handle(G, G.events);
  view.render(G, simDt);
  updateHud();
  devlog.update(G);
  telemetry.update(G);
}
requestAnimationFrame(frame);

/**
 * Fast simulation: steps at full speed (~25 ms per frame so the screen doesn't freeze),
 * with the autopilot buying, until reaching the requested wave or losing.
 */
function turbo() {
  const prevAuto = G.dev.autoplay;
  G.dev.autoplay = true;
  G.cheated = true;
  const t0 = performance.now();
  while (performance.now() - t0 < 25 && G.wave < time.turboTo && !G.over) {
    for (let k = 0; k < 60; k++) step(G, FIXED, autopilotDir(G));
    // without this, thousands of floating texts and sounds would pile up
    G.events.length = 0;
  }
  G.dev.autoplay = prevAuto;
  if (G.wave >= time.turboTo || G.over) {
    time.turboNote = G.over ? `Lost at wave ${G.wave} (${Math.round(G.t)} s of play)` : `Reached wave ${G.wave} (${Math.round(G.t)} s of play)`;
    time.turboTo = 0;
  }
}

// for debugging from the console (only with `npm run dev`: in the published version they'd be free cheats
// and cheated games would reach the leaderboard as clean ones)
if (import.meta.env.DEV) {
  Object.assign(window, {
    game: () => G,
    view,
    sound,
    /** Advance the simulation N seconds at once (handy for testing from the console). */
    advance: (seconds: number, dir: Vec = { x: 0, y: 0 }) => {
      for (let t = 0; t < seconds; t += FIXED) step(G, FIXED, dir);
      sound.handle(G, G.events);
      view.render(G, FIXED);
      devlog.update(G);
      telemetry.update(G);
    },
  });
}

// --- developer menu (only with `npm run dev`; F1 or º, or three taps on the wave counter)
if (import.meta.env.DEV) {
  import('./dev/panel').then(m => m.initDevPanel({
    game: () => G, view, sound, devlog, time, restart: () => (inTitle ? startGame() : restart()), fps: () => fps, simMs: () => simMs,
  }));
}
