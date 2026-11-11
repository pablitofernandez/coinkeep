import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Game version for telemetry: the commit it's built from. */
function appVersion() {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
}

/**
 * Development only: receives each game's log (POST /__log) and saves it to logs/<session>.json.
 * That way real games (including ones played on mobile) can be analysed to balance the game.
 */
function gameLogPlugin(): Plugin {
  const dir = path.resolve(__dirname, 'logs');
  return {
    name: 'game-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        // Only the game itself. Requiring JSON forces the browser to ask first (CORS), and Vite doesn't
        // let other sites through; also, if it comes from another site (different Origin), reject it.
        const type = String(req.headers['content-type'] ?? '');
        const origin = req.headers.origin;
        let sameOrigin = true;
        if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; } }
        if (!type.startsWith('application/json') || !sameOrigin) { res.statusCode = 403; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 5_000_000) req.destroy(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const id = String(data.session ?? 'unknown').replace(/[^\w-]/g, '_');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 1));
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // In production, relative paths: the game works from any folder
  // (GitHub Pages serves it at /coinkeep/). Models and sounds use import.meta.env.BASE_URL.
  base: command === 'build' ? './' : '/',
  plugins: [gameLogPlugin()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
}));
