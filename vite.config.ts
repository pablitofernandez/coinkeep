import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Versión del juego para la telemetría: el commit con el que se compila. */
function appVersion() {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
}

/**
 * Solo en desarrollo: recibe el registro de cada partida (POST /__log) y lo guarda en logs/<sesión>.json.
 * Así se pueden analizar partidas reales (también jugadas desde el móvil) para equilibrar el juego.
 */
function gameLogPlugin(): Plugin {
  const dir = path.resolve(__dirname, 'logs');
  return {
    name: 'game-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
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
  // En producción, rutas relativas: el juego funciona en cualquier carpeta
  // (GitHub Pages lo sirve en /coinkeep/). Modelos y sonidos usan import.meta.env.BASE_URL.
  base: command === 'build' ? './' : '/',
  plugins: [gameLogPlugin()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
}));
