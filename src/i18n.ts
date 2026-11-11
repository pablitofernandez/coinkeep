// ============================================================
//  Translations: every text the player sees, in English and Spanish.
//  The language follows the system (any Spanish variant → Spanish, anything
//  else → English) unless the player picks one on the title screen (saved
//  in localStorage as `sg-lang`).
//
//  Pure module (no DOM except `applyStatic`), so the simulation can use `t()`.
//  Adding a text: add the key to BOTH dictionaries (TypeScript checks it).
// ============================================================

export type Lang = 'en' | 'es';
export const LANGS: Lang[] = ['en', 'es'];
const LANG_KEY = 'sg-lang';

const en = {
  // loading and HUD
  'loading': 'Loading…',
  'loading.pct': 'Loading… {pct}%',
  'hud.wave': 'Wave {n}',
  'hud.ready': 'Get ready…',
  'hud.next': 'Next in {s}s · Enemies: {n}',
  'hud.mute': 'Mute sound (M)',
  'hud.sound': 'Sound (M)',
  'hud.music': 'Music (N)',
  'help': 'Move with arrows/WASD or by dragging your finger<br><b>Kill enemies → collect coins → take them to the plots</b>',

  // title screen
  'meta.description': 'Isometric tower defense for the browser: defend the castle and keep every coin.',
  'title.tagline': 'Defend the castle · Keep every coin',
  'title.difficulty': 'Difficulty',
  'title.leaderboard': '🏆 Leaderboard',
  'title.news': "📜 What's new",
  'title.close': 'Close',
  'title.start': 'Tap the screen or press a key to play',
  'title.language': 'Language',
  'title.byline': 'Pablo Fernández · <i>vibe coded</i> with Claude Opus 5.5',

  'diff.normal': 'Normal',
  'diff.hard': 'Hard',
  'diff.nightmare': 'Nightmare',

  // leaderboard
  'board.row': 'Wave {wave} · {time}',
  'board.empty': 'No records yet. Be the first!',
  'board.loadError': 'Could not load the leaderboard.',

  // game over
  'over.title': 'The castle has fallen!',
  'over.summary': '{diff} · Wave {wave} · {time} · {towers} towers',
  'over.cheated': 'Game with cheats: it does not count for the leaderboard.',
  'over.wouldEnter': 'You would be number {rank}! Enter your name.',
  'over.wouldBe': 'You would be number {rank}.',
  'over.connectError': 'Could not connect to the leaderboard.',
  'over.needName': 'Enter a name.',
  'over.saving': 'Saving…',
  'over.saved': 'Saved! Number {rank} in {diff}.',
  'over.saveError': 'Could not save. Please try again.',
  'over.name': 'Your name',
  'over.send': 'Save record',
  'over.again': 'Play again',
  'over.menu': 'Menu',

  // plots
  'pad.archer': 'Archer tower',
  'pad.cannon': 'Cannon',
  'pad.power': 'Strength +40%',
  'pad.repair': 'Repair castle',
  'pad.forge': 'Forge: damage +25%',
  'pad.kennel': 'Wolf',
  'pad.peon': 'Peon',
  'pad.upgrade': 'Upgrade tower',
  'pad.level': '{name} (Lv {n})',
  'pad.towerTo': 'Tower → Lv {n}',

  // floating texts in the game
  'float.new': 'New!',
  'float.waveCleared': 'Wave cleared!',
  'float.boss': 'BOSS!',
  'float.wave': 'Wave {n}',
  'float.built': '{name}!',
  'float.builtLevel': '{name} Lv {n}!',
  'float.tower': 'Tower Lv {n}',
  'float.power': 'Sword {sword} · Crossbow {bow}',
  'float.repaired': 'Castle repaired',
  'float.castleHeal': 'Castle +{n}',
  'float.wolf': 'Awooo! You have a wolf',
  'float.peon': 'Peon hired!',
  'float.helpers': '{name} Lv {n} · {count} units',
  'float.damage': 'Damage x{n}',
  'helper.dog': 'Wolves',
  'helper.peon': 'Peons',
};

type Key = keyof typeof en;

const es: Record<Key, string> = {
  'loading': 'Cargando…',
  'loading.pct': 'Cargando… {pct}%',
  'hud.wave': 'Oleada {n}',
  'hud.ready': 'Preparados…',
  'hud.next': 'Siguiente en {s}s · Enemigos: {n}',
  'hud.mute': 'Silenciar sonido (M)',
  'hud.sound': 'Sonido (M)',
  'hud.music': 'Música (N)',
  'help': 'Muévete con flechas/WASD o arrastrando el dedo<br><b>Mata enemigos → recoge monedas → llévalas a las parcelas</b>',

  'meta.description': 'Tower defense isométrico para el navegador: defiende el castillo y guarda cada moneda.',
  'title.tagline': 'Defiende el castillo · Guarda cada moneda',
  'title.difficulty': 'Dificultad',
  'title.leaderboard': '🏆 Clasificación',
  'title.news': '📜 Novedades',
  'title.close': 'Cerrar',
  'title.start': 'Toca la pantalla o pulsa una tecla para jugar',
  'title.language': 'Idioma',
  'title.byline': 'Pablo Fernández · <i>vibe coded</i> con Claude Opus 5.5',

  'diff.normal': 'Normal',
  'diff.hard': 'Difícil',
  'diff.nightmare': 'Pesadilla',

  'board.row': 'Oleada {wave} · {time}',
  'board.empty': 'Todavía no hay récords. ¡Sé el primero!',
  'board.loadError': 'No se pudo cargar la clasificación.',

  'over.title': '¡La base ha caído!',
  'over.summary': '{diff} · Oleada {wave} · {time} · {towers} torres',
  'over.cheated': 'Partida con trucos: no cuenta para la clasificación.',
  'over.wouldEnter': '¡Entrarías en el puesto {rank}! Escribe tu nombre.',
  'over.wouldBe': 'Quedarías en el puesto {rank}.',
  'over.connectError': 'No se pudo conectar con la clasificación.',
  'over.needName': 'Escribe un nombre.',
  'over.saving': 'Guardando…',
  'over.saved': '¡Guardado! Puesto {rank} en {diff}.',
  'over.saveError': 'No se pudo guardar. Inténtalo otra vez.',
  'over.name': 'Tu nombre',
  'over.send': 'Guardar récord',
  'over.again': 'Jugar otra vez',
  'over.menu': 'Menú',

  'pad.archer': 'Torre arquera',
  'pad.cannon': 'Cañón',
  'pad.power': 'Fuerza +40%',
  'pad.repair': 'Reparar base',
  'pad.forge': 'Forja: daño +25%',
  'pad.kennel': 'Lobo',
  'pad.peon': 'Peón',
  'pad.upgrade': 'Mejorar torre',
  'pad.level': '{name} (Nv {n})',
  'pad.towerTo': 'Torre → Nv {n}',

  'float.new': '¡Nuevo!',
  'float.waveCleared': '¡Oleada superada!',
  'float.boss': '¡JEFE!',
  'float.wave': 'Oleada {n}',
  'float.built': '¡{name}!',
  'float.builtLevel': '¡{name} Nv {n}!',
  'float.tower': 'Torre Nv {n}',
  'float.power': 'Espada {sword} · Ballesta {bow}',
  'float.repaired': 'Base reparada',
  'float.castleHeal': 'Castillo +{n}',
  'float.wolf': '¡Auuu! Tienes un lobo',
  'float.peon': '¡Peón contratado!',
  'float.helpers': '{name} Nv {n} · {count} unidades',
  'float.damage': 'Daño x{n}',
  'helper.dog': 'Lobos',
  'helper.peon': 'Peones',
};

const DICT: Record<Lang, Record<Key, string>> = { en, es };

/** System language: Spanish if any preferred language is Spanish and comes before English; otherwise English. */
function systemLang(): Lang {
  try {
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of prefs) {
      const base = (l ?? '').toLowerCase().split('-')[0];
      if (base === 'es') return 'es';
      if (base === 'en') return 'en';
    }
  } catch { /* no navigator (tests) */ }
  return 'en';
}

function savedLang(): Lang | null {
  try { const l = localStorage.getItem(LANG_KEY) as Lang | null; return l && LANGS.includes(l) ? l : null; } catch { return null; }
}

let current: Lang = typeof navigator === 'undefined' ? 'en' : savedLang() ?? systemLang();

export const getLang = () => current;

/** Change the language (and remember it). The caller re-renders the texts on screen (`applyStatic`…). */
export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* no storage */ }
}

/** Text for `key` in the current language, with `{name}` placeholders filled in from `params`. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const s = DICT[current][key] ?? en[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : s;
}

/**
 * Fill in the static texts of index.html:
 *  - data-i18n="key"        → textContent
 *  - data-i18n-html="key"   → innerHTML (only our own constant texts, never player input)
 *  - data-i18n-attr="attr:key;attr:key" → attributes (aria-label, placeholder, title, content…)
 */
export function applyStatic(root: ParentNode = document) {
  document.documentElement.lang = current;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim() as Key));
    }
  });
}
