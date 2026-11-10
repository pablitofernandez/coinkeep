# 🪙 Coinkeep

*Tower defense* isométrico para el navegador, en escritorio y en móvil. Eres un pícaro que defiende su castillo de oleadas de zombis. Matas enemigos, cargas a la espalda una pila de monedas cada vez más alta y la gastas pisando parcelas para levantar torres, mejorarlas, forjar armas y contratar lobos y peones que te ayuden.

> **Hecho con *vibe coding*.** Este juego lo ha creado **Pablo Fernández** en conversación con **Claude Opus 5.5** (Anthropic), a través de Claude Code. Pablo ha dirigido el diseño, el estilo, el equilibrio y las pruebas. Claude ha escrito prácticamente todo el código, la música sintetizada y los efectos de sonido.

## Cómo se juega

- **Moverse:** flechas o WASD. En el móvil, arrastra el dedo por la pantalla (joystick virtual).
- **Atacar:** el pícaro ataca solo. Usa la daga si tiene un zombi cerca y la ballesta si está más lejos.
- **Dinero:** recoge las monedas del suelo y de las mesas de las torres.
- **Construir:** quédate un momento encima de una parcela para pagarla.
  - 🏹 **Torre arquera** y 💣 **cañón**: defienden solos y se mejoran hasta el nivel 7.
  - 💪 **Fuerza**: más daño para la daga y la ballesta.
  - 🔨 **Forja**: multiplica el daño de todo.
  - 🏰 **Reparar**: cura y amplía el castillo.
  - 🐺 **Lobos**: recogen monedas del suelo y muerden zombis.
  - 🧔 **Peones**: vacían las mesas de botín de las torres.
- **Sonido:** `M` silencia el juego y `N` la música.

## Arrancarlo

Hace falta [Node.js](https://nodejs.org/) 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El servidor arranca con `--host`, así que puedes jugar desde el móvil en `http://<IP-de-tu-PC>:5173`.

Otros comandos:
- `npm run build`: comprueba tipos y genera la versión de producción en `dist/`.
- `npm run typecheck`: solo comprueba los tipos.

### Menú de desarrollador

En modo desarrollo, pulsa **F1** o **º** (en el móvil, toca tres veces el contador de oleada). Desde ahí puedes:
- Generar zombis y jefes, o saltar de oleada.
- Cambiar la vida del castillo, darte monedas o construirlo todo.
- Acelerar o pausar el tiempo, o simular partidas enteras con un piloto automático.
- Ver colisiones y alcances, escuchar cada sonido y seguir los datos de la partida en directo.

No se incluye en la versión de producción.

## Tecnología

- [Three.js](https://threejs.org/): cámara ortográfica isométrica, sombras, modelos GLB, animación con esqueleto e instancias.
- TypeScript estricto y [Vite](https://vite.dev/).
- WebAudio:
  - Efectos: muestras grabadas mezcladas con tonos sintetizados.
  - Música de fantasía sintetizada en tiempo real: flauta, arpa con el algoritmo Karplus-Strong, cuerdas, chelo y tambores, con reverberación.
- Simulación de paso fijo, separada del render (`src/game/` no sabe nada de Three.js).

## Créditos de los recursos

Todos los modelos y sonidos son **CC0** (dominio público). Gracias a sus autores:

- **[Kenney](https://kenney.nl)**:
  - [Mini Characters](https://kenney.nl/assets/mini-characters)
  - [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit)
  - [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit)
  - [Castle Kit](https://kenney.nl/assets/castle-kit)
  - [Nature Kit](https://kenney.nl/assets/nature-kit)
  - [Impact Sounds](https://kenney.nl/assets/impact-sounds)
- **[KayKit](https://kaylousberg.com)** (Kay Lousberg): Adventurers 2.0. De ahí salen el pícaro, la daga, la ballesta y las animaciones.
- **[Quaternius](https://quaternius.com)**: Ultimate Animated Animals. De ahí sale el lobo.

El detalle de qué se usa de cada pack está en [`public/models/CREDITS.txt`](public/models/CREDITS.txt).

## Licencia

El código está bajo licencia [MIT](LICENSE), © 2026 Pablo Fernández. Los modelos y sonidos de `public/` mantienen su licencia CC0 original.
