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

  // cards (src/game/cards.ts)
  'cards.title': 'Boss defeated! Choose a card',
  'cards.reroll': '🎲 New hand · {cost}',
  'cards.keys': 'Keys 1 · 2 · 3 to choose, R for a new hand',
  'cards.owned': 'You have {n}',
  'rarity.common': 'Common',
  'rarity.rare': 'Rare',
  'rarity.epic': 'Epic',
  'float.interest': '+{n} interest',
  'card.sharpArrows.name': 'Sharp arrows',
  'card.sharpArrows.desc': 'Archer towers deal 20% more damage.',
  'card.tautString.name': 'Taut string',
  'card.tautString.desc': 'Archer towers shoot 20% faster.',
  'card.blackPowder.name': 'Black powder',
  'card.blackPowder.desc': 'Cannon explosions are 50% bigger.',
  'card.siegeShot.name': 'Siege shot',
  'card.siegeShot.desc': 'Cannons deal double damage to bosses.',
  'card.hawkEye.name': 'Hawk eye',
  'card.hawkEye.desc': 'All towers reach 20% farther.',
  'card.arrowRain.name': 'Arrow rain',
  'card.arrowRain.desc': 'Every 4th archer shot fires 3 arrows.',
  'card.foundations.name': 'Foundations',
  'card.foundations.desc': 'Tower upgrades available now cost 50% less.',
  'card.temperedBlade.name': 'Tempered blade',
  'card.temperedBlade.desc': 'Your sword deals 30% more damage.',
  'card.lightBoots.name': 'Light boots',
  'card.lightBoots.desc': 'You move 20% faster.',
  'card.magnet.name': 'Magnet',
  'card.magnet.desc': 'Coins fly to you from twice as far away.',
  'card.piercingBolt.name': 'Piercing bolt',
  'card.piercingBolt.desc': 'Your crossbow bolts also hit two more enemies nearby.',
  'card.whirlwind.name': 'Whirlwind',
  'card.whirlwind.desc': 'Your sword slash hits every enemy around you.',
  'card.reinforcedWalls.name': 'Reinforced walls',
  'card.reinforcedWalls.desc': 'The castle gets +25 max health and is partly repaired.',
  'card.mortar.name': 'Mortar',
  'card.mortar.desc': 'Clearing a wave heals 15% more of the castle.',
  'card.boilingOil.name': 'Boiling oil',
  'card.boilingOil.desc': 'Enemies attacking the castle get burned.',
  'card.moat.name': 'Moat',
  'card.moat.desc': 'Enemies are 30% slower near the castle.',
  'card.discount.name': 'Discount',
  'card.discount.desc': 'Plots available now cost 40% less.',
  'card.tithe.name': 'Tithe',
  'card.tithe.desc': 'Enemies drop 10% more coins.',
  'card.interest.name': 'Interest',
  'card.interest.desc': 'At the end of each wave you earn 5% of the coins you carry (up to 50).',
  'card.cart.name': 'Cart',
  'card.cart.desc': 'At the end of each wave, the tables send you 30% of their coins.',
  'card.pack.name': 'Pack',
  'card.pack.desc': 'Wolves deal 60% more damage, and it grows with each wave.',
  'card.apprentice.name': 'Apprentice',
  'card.apprentice.desc': 'A free peon (or one more, if you have them).',
  'card.bossBone.name': 'Boss bone',
  'card.bossBone.desc': 'Wolves deal triple damage to bosses.',
  'card.batHunter.name': 'Bat hunter',
  'card.batHunter.desc': '60% more damage against flying enemies.',
  'card.silence.name': 'Silence',
  'card.silence.desc': 'Mages heal 60% less.',
  'card.giantSlayer.name': 'Giant slayer',
  'card.giantSlayer.desc': 'Everything deals 50% more damage to bosses.',
  'card.bloodPact.name': 'Blood pact',
  'card.bloodPact.desc': 'Everything deals 35% more damage, but the castle loses 20 max health.',
  'card.goldFever.name': 'Gold fever',
  'card.goldFever.desc': '25% more coins, but 25% more enemies.',
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

  // cartas (src/game/cards.ts)
  'cards.title': '¡Jefe derrotado! Elige una carta',
  'cards.reroll': '🎲 Otra mano · {cost}',
  'cards.keys': 'Teclas 1 · 2 · 3 para elegir, R para otra mano',
  'cards.owned': 'Tienes {n}',
  'rarity.common': 'Común',
  'rarity.rare': 'Rara',
  'rarity.epic': 'Épica',
  'float.interest': '+{n} de interés',
  'card.sharpArrows.name': 'Flechas afiladas',
  'card.sharpArrows.desc': 'Las torres arqueras hacen un 20 % más de daño.',
  'card.tautString.name': 'Cuerda tensa',
  'card.tautString.desc': 'Las torres arqueras disparan un 20 % más rápido.',
  'card.blackPowder.name': 'Pólvora negra',
  'card.blackPowder.desc': 'Las explosiones del cañón son un 50 % más grandes.',
  'card.siegeShot.name': 'Bala de asedio',
  'card.siegeShot.desc': 'Los cañones hacen el doble de daño a los jefes.',
  'card.hawkEye.name': 'Ojo de halcón',
  'card.hawkEye.desc': 'Todas las torres llegan un 20 % más lejos.',
  'card.arrowRain.name': 'Lluvia de flechas',
  'card.arrowRain.desc': 'Cada 4.º disparo de las arqueras lanza 3 flechas.',
  'card.foundations.name': 'Cimientos',
  'card.foundations.desc': 'Las mejoras de torre que hay ahora cuestan un 50 % menos.',
  'card.temperedBlade.name': 'Filo templado',
  'card.temperedBlade.desc': 'Tu espada hace un 30 % más de daño.',
  'card.lightBoots.name': 'Botas ligeras',
  'card.lightBoots.desc': 'Te mueves un 20 % más rápido.',
  'card.magnet.name': 'Imán',
  'card.magnet.desc': 'Las monedas vuelan hacia ti desde el doble de lejos.',
  'card.piercingBolt.name': 'Virote perforante',
  'card.piercingBolt.desc': 'Los virotes de tu ballesta también dan a otros dos enemigos cercanos.',
  'card.whirlwind.name': 'Torbellino',
  'card.whirlwind.desc': 'El tajo de tu espada golpea a todos los enemigos a tu alrededor.',
  'card.reinforcedWalls.name': 'Muros reforzados',
  'card.reinforcedWalls.desc': 'El castillo gana +25 de vida máxima y se repara en parte.',
  'card.mortar.name': 'Argamasa',
  'card.mortar.desc': 'Al limpiar una oleada, el castillo se cura un 15 % más.',
  'card.boilingOil.name': 'Aceite hirviendo',
  'card.boilingOil.desc': 'Los enemigos que atacan el castillo se queman.',
  'card.moat.name': 'Foso',
  'card.moat.desc': 'Los enemigos van un 30 % más lentos cerca del castillo.',
  'card.discount.name': 'Rebaja',
  'card.discount.desc': 'Las parcelas que hay ahora cuestan un 40 % menos.',
  'card.tithe.name': 'Diezmo',
  'card.tithe.desc': 'Los enemigos sueltan un 10 % más de monedas.',
  'card.interest.name': 'Interés',
  'card.interest.desc': 'Al acabar cada oleada ganas un 5 % de las monedas que llevas (hasta 50).',
  'card.cart.name': 'Carreta',
  'card.cart.desc': 'Al acabar cada oleada, las mesas te envían un 30 % de sus monedas.',
  'card.pack.name': 'Manada',
  'card.pack.desc': 'Los lobos hacen un 60 % más de daño, y crece con cada oleada.',
  'card.apprentice.name': 'Aprendiz',
  'card.apprentice.desc': 'Un peón gratis (o uno más, si ya tienes).',
  'card.bossBone.name': 'Hueso de jefe',
  'card.bossBone.desc': 'Los lobos hacen el triple de daño a los jefes.',
  'card.batHunter.name': 'Cazamurciélagos',
  'card.batHunter.desc': 'Un 60 % más de daño contra enemigos voladores.',
  'card.silence.name': 'Silencio',
  'card.silence.desc': 'Los magos curan un 60 % menos.',
  'card.giantSlayer.name': 'Matagigantes',
  'card.giantSlayer.desc': 'Todo hace un 50 % más de daño a los jefes.',
  'card.bloodPact.name': 'Pacto de sangre',
  'card.bloodPact.desc': 'Todo hace un 35 % más de daño, pero el castillo pierde 20 de vida máxima.',
  'card.goldFever.name': 'Fiebre del oro',
  'card.goldFever.desc': 'Un 25 % más de monedas, pero un 25 % más de enemigos.',
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
