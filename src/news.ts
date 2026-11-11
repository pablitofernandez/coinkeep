// ============================================================
//  "What's new" on the title screen: the changelog, in the player's language.
//  The texts come straight from CHANGELOG.md / CHANGELOG.es.md (bundled at build
//  time with `?raw`), so the repo and the game never disagree.
//
//  Only the small subset of Markdown those files use is understood:
//  `## version`, `### section`, `- item` (indented `  - ` for sub-items),
//  plain paragraphs, **bold** and [links](url) (shown as plain text).
// ============================================================
import changelogEn from '../CHANGELOG.md?raw';
import changelogEs from '../CHANGELOG.es.md?raw';
import { getLang } from './i18n';

const SEEN_KEY = 'sg-seen-version';
/** Keys that only exist if this browser has played before (to tell returning players from new ones). */
const RETURNING_KEYS = ['sg-diff', 'sg-name', 'sg-player', 'sg-music', 'sg-muted'];

/** Latest version: the first `## x.y.z` heading of the changelog. */
export const LATEST_VERSION = /^## (\S+)/m.exec(changelogEn)?.[1] ?? '';

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Inline Markdown: **bold** and [text](url) → text. Escapes everything else. */
const inline = (s: string) => escape(s)
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/** The changelog as HTML (our own file, escaped anyway). Everything before the first version is skipped. */
export function changelogHtml(): string {
  const md = getLang() === 'es' ? changelogEs : changelogEn;
  const out: string[] = [];
  let started = false, inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) { started = true; closeList(); out.push(`<h3>${inline(line.slice(3))}</h3>`); continue; }
    if (!started) continue;
    const item = /^(\s*)- (.*)$/.exec(line);
    if (item) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li${item[1].length ? ' class="sub"' : ''}>${inline(item[2])}</li>`);
      continue;
    }
    closeList();
    if (line.startsWith('### ')) out.push(`<h4>${inline(line.slice(4))}</h4>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
}

/** Is there a version this player hasn't seen yet? New players (first visit) see no dot. */
export function hasUnseenNews(): boolean {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen) return seen !== LATEST_VERSION;
    const returning = RETURNING_KEYS.some(k => localStorage.getItem(k) !== null);
    if (!returning) localStorage.setItem(SEEN_KEY, LATEST_VERSION);
    return returning;
  } catch { return false; }
}

/** Remember that the player has seen the latest version. */
export function markNewsSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST_VERSION); } catch { /* no storage */ }
}
