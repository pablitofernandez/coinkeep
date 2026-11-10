# Coinkeep (antes «Stack Defense») — guía para continuar el proyecto

*Tower defense* isométrico para navegador (escritorio y móvil). El jugador es un caballero que mata enemigos, recoge monedas y las gasta pisando **parcelas** para construir torres, mejorarlas y contratar ayudantes. Todo el juego (textos, comentarios y conversación con el usuario) está **en español**.

Stack:
- Vite 8
- TypeScript estricto (`noUnusedLocals`)
- Three.js 0.187: cámara ortográfica isométrica, simulación con paso fijo
- Audio con WebAudio
- Modelos 3D de Kenney (CC0)

---

## Arrancar y comprobar

Comandos:
- `npm run dev`: Vite con `--host`, así se puede jugar desde el móvil en `http://<IP-del-PC>:5173`. En la app de escritorio de Claude es la configuración `game` de `.claude/launch.json`.
- `npm run typecheck`, o `npx tsc --noEmit`: hay que pasarlo siempre antes de dar algo por terminado.
- `npm run build`: comprobación de tipos más build de producción en `dist/`.

Para depurar desde la consola del navegador (se definen en `src/main.ts`):
- `game()` **es una función** que devuelve el `GameState`. No es un objeto.
- `view` y `sound` son las instancias de render y audio.
- `advance(segundos, dir?)` avanza la simulación de golpe y renderiza. **Ojo:** también envía el registro de partida (ver más abajo).

Para inyectar un ayudante y verlo sin jugar:

```js
const G = game(), p = G.player;
G.helpers.push({ id: 99999, kind: 'peon', x: p.x + 1.2, y: p.y + 0.3, level: 1, carry: 0, mode: 'idle', moving: false,
  faceX: 0, faceY: 1, home: { x: p.x + 1, y: p.y }, acc: 0, targetId: -1, atkCd: 0, attackT: 0, slot: 0 });
```

**Menú de desarrollador** (`src/dev/panel.ts`, solo en modo dev; no entra en el build de producción):
- Se abre con **F1** o **º**, y en el móvil con tres toques en el contador de oleada.
- Secciones:
  - Enemigos y oleadas.
  - Castillo y jugador.
  - Economía, con piloto automático.
  - Construcción.
  - Tiempo: velocidad ×0,25–×8, pausa, paso a paso y **simular hasta la oleada N** con piloto automático.
  - Visualización: colisiones, alcances, caminos, zoom y regenerar decorado.
  - Audio: botonera de sonidos y volúmenes.
  - Datos de la oleada en directo.
- Los trucos están en `src/game/cheats.ts` (puros) y en `G.dev` (`DevFlags`), que la simulación consulta.
- Usar cualquier truco pone `G.cheated = true` y el registro sale con `"cheats": true`.
- Para equilibrar sin jugar: «Simular hasta oleada N». Hace 15 oleadas en unos 4 s y deja un registro con `cheats: true`.
  - El piloto automático recoge todo el dinero al instante, compra la parcela más barata y mueve al pícaro hacia el zombi más cercano al castillo.
  - Juega mejor que una persona con la recogida y peor con la estrategia.

Problemas conocidos al probar:
- **La app de escritorio para el servidor de desarrollo por su cuenta.** Pasa tras un rato o al cambiar de turno. Si `curl localhost:5173` falla, vuelve a arrancarlo.
- Con la pestaña del navegador oculta los fotogramas se congelan. Usa `advance()` y espera ~1 s antes de cada captura.
- El audio solo arranca tras un clic o una tecla del usuario.

---

## Registro de partidas (logs) — importante

`src/devlog.ts` envía un JSON con las estadísticas de la partida a `POST /__log` al acabar cada oleada y al perder. Solo funciona en modo dev. El plugin de `vite.config.ts` lo guarda en `logs/<sesión>.json`, y `src/game/stats.ts` acumula los datos por oleada.

- El usuario pide a menudo **«analiza la última partida»**. Coge el `.json` más reciente de `logs/` y fíjate en `device`, `result`, `totals` y `waves[]`. Cada oleada trae dinero ganado y gastado por fuente, muertes por fuente, torres (`A3` = arquera nivel 3), `towerMult`, ayudantes y parcelas.
- **Los logs del usuario no se borran.** Las pruebas propias (pestañas del navegador de Claude, `advance()`) generan logs; borra solo esos.
  - Se reconocen por `"cheats": true`, por pantallas de 0x0 o 1024x768, o por la hora.
  - Ojo: el usuario también juega en el panel del navegador de la app (971x846), así que la pantalla sola no basta.
  - Los logs con `cheats: true` del usuario son pruebas suyas con el menú: no sirven para equilibrar.
- Si el servidor está parado, el registro se guarda en `localStorage` (`sg-pending-logs`) y se reenvía en cuanto haya conexión. Antes se perdía: una partida de más de 90 oleadas quedó guardada solo hasta la 18.

---

## Estructura

```
src/
  main.ts          bucle principal, pantalla de título (escena de exhibición con `showcase` y cámara orbitando: `view.orbit`), botones del HUD (🔊 sonido = M, 🎵 música = N), pantalla de carga, globales de depuración
  config.ts        TODO el equilibrio: mundo, jugador, oleadas, enemigos, parcelas, mejoras, ayudantes, forja
  input.ts         teclado y joystick táctil; `preventBrowserZoom()` corta el zoom del móvil (Safari ignora `user-scalable=no`)
  devlog.ts        envío de logs (ver arriba)
  audio.ts         clase Sound: muestras de Kenney + tonos sintetizados + pasos del caballero
  music.ts         clase Music: música de fantasía sintetizada (flauta, arpa Karplus-Strong, cuerdas, chelo, tambores, reverberación; re menor, 16 compases)
  style.css        HUD, etiquetas CSS2D, carga
  game/
    types.ts       GameState, eventos (GameEvent, SfxName), parcelas, ayudantes…
    sim.ts         simulación pura (sin Three.js): oleadas, enemigos, jugador, parcelas, torres, disparos, ayudantes
    stats.ts       estadísticas por oleada para los logs
    cheats.ts      trucos del menú de desarrollador (puros) y movimiento del piloto automático
  dev/
    panel.ts       menú de desarrollador (DOM); se carga con import() solo en modo dev
  render/
    debugDraw.ts   líneas de depuración: colisiones, alcances, caminos de ayudantes
    view.ts        escena Three.js: sincroniza el estado con los modelos, etiquetas CSS2D, polvo, cámara
    assets.ts      carga GLB (lista FILES), materiales compartidos, Character (animaciones), instanced(), bake()
    kit.ts         montaje de modelos: pícaro (jugador), zombis, lobo, peón, torres por piezas, castillo, cabaña
    models.ts      lo poco que sigue procedural: mesas, parcelas, caseta del perro, monedas
public/
  models/<pack>/   GLB seleccionados + Textures/colormap.png; CREDITS.txt con los packs
  sounds/          MP3 mono convertidos de Kenney Impact Sounds (nombre_0..4.mp3)
vendor/kenney/     zips y packs descomprimidos de Kenney (en .gitignore; es la fuente de modelos y sonidos)
poc/               prototipo inicial en un solo HTML (histórico)
logs/              logs de partidas (en .gitignore)
art/               fuentes originales: Coinkeep.png (logo del usuario, fondo blanco; recortado a public/logo.webp)
docs/screenshots/  capturas del README (desktop.jpg 800x450, mobile.jpg 375x812), sacadas del panel del navegador
public/title.jpg   portada 1600x900 para README y og:image: escena renderizada a mano + logo dibujado en un canvas
```

### Flujo de datos

1. `sim.step(G, dt, dir)` muta el `GameState` y añade eventos a `G.events`.
2. `sound.handle(G, G.events)` los convierte en sonidos.
3. `view.render(G, dt)` los usa para el texto flotante, el vuelo de monedas, etc., y luego vacía la lista.
4. La simulación **no** importa nada de render ni de audio.

Para añadir un sonido:
1. Añade el nombre a `SfxName` en `types.ts`.
2. Lanza `sfx(G, nombre, x, y)` desde `sim.ts`.
3. Dale su caso en el `switch` de `Sound.play`.

---

## Modelos 3D (Kenney, KayKit y Quaternius; todos CC0)

| Pack | Carpeta | Uso |
|---|---|---|
| KayKit Adventurers 2.0 | `kaykit` | **jugador**: `Rogue` (pícaro) con `dagger` en `handslotr` y `crossbow_1handed` en `handslotl`; animaciones de `Rig_Medium_General` y `Rig_Medium_MovementBasic` (`Idle_A`, `Running_A`, `Throw`…). Escala 0.46 |
| Ultimate Animated Animals (Quaternius) | `animals` | `wolf`, el **lobo** (antes perro; en el código sigue siendo `dog`/`kennel`). Animaciones `Idle`, `Walk`, `Gallop`, `Attack`. Escala 0.19 |
| Mini Characters | `chars` | zombi (enemigo; el jefe es el mismo zombi a escala 2.3), `character-male-b` (peón, aldeano barbudo) |
| Tower Defense Kit | `td` | torres apiladas por piezas según nivel, ballesta y cañón giratorios, proyectiles, cristales |
| Fantasy Town Kit | `town` | cabaña del peón (paredes, tejado, chimenea, estandarte, farol) |
| Castle Kit | `castle` | castillo central, 5 niveles (sube con «Reparar base») |
| Nature Kit | `nature` | árboles, rocas, flores, setas… con colores reasignados en `NATURE_COLORS` porque venían pastel |

Notas:
- **Los zips de kenney.nl no se pueden descargar con curl.** Los enlaces firmados dan 403, y saltarse la comprobación antibots no está permitido. Pide al usuario que descargue el zip a mano en `vendor/kenney/` y luego descomprímelo allí.
- Para añadir un modelo:
  1. Copia el `.glb` a `public/models/<pack>/`, junto con `Textures/colormap.png` si el pack es nuevo.
  2. Añade el nombre a `FILES` en `assets.ts`.
  3. Usa `model(nombre)`, que devuelve un clon, o `new Character(nombre, escala)`.
- Todos los personajes de Mini Characters comparten esqueleto y animaciones: `idle`, `walk`, `sprint`, `die`, `attack-melee-right`, `interact-right`, `holding-both`…
- KayKit (versión gratuita) **no trae animaciones de ataque**:
  - El tajo usa `Throw` filtrada a cintura para arriba (`Character.upperBody`), así ataca sin dejar de correr.
  - El disparo de ballesta es procedural (`aimCrossbow` en `kit.ts`): estira el brazo izquierdo y orienta la ballesta hacia delante.
- **Three.js quita los puntos de los nombres de los huesos** al cargar: `hand.r` pasa a ser `handr`.
- `FILES` admite `.gltf` con extensión explícita (las armas de KayKit vienen así). Los packs originales están en `vendor/kaykit-adventurers/` y `vendor/animals/`.
- El lobo se convirtió de `.gltf` con base64 a `.glb` con un script de nodo (ahorra ~40 %).
- Rendimiento (en móvil sobre todo):
  - Las piezas estáticas se funden con `bake(grupo, clave)`, cacheado por clave. Los objetos llamados `flag` (ondean) o `crystal` (giran) se dejan aparte.
  - La vegetación usa `InstancedMesh`.
  - Se llegó a ~1.500 draw calls; ahora rondan unas 120–600.
  - **Etiquetas HTML** (precios, barras de vida, estrellas…): las pinta `src/render/labels.ts` (`LabelRenderer`), no el `CSS2DRenderer` de Three.js. Solo toca el DOM si algo cambia, oculta lo que queda fuera de pantalla y redondea a píxeles enteros. Con 214 etiquetas tarda 0,6 ms por fotograma frente a 2,2 ms (en PC). Se siguen creando con `CSS2DObject`.
  - **Sombras en móvil** cada 2 fotogramas (`view.shadowEvery`): ahorran casi la mitad de las llamadas de dibujo. Lo quieto no tiembla, porque el mapa viejo se usa con su propia matriz de luz.
  - **Limitador de fotogramas** con umbral de 10 ms (`MIN_FRAME_MS`). Con 16,4 ms, cualquier fotograma que llegara un poco antes se saltaba y daba tirones a 30 fps en iPhone.
  - El menú de desarrollo muestra los ms por fotograma de simulación, 3D y etiquetas. Ojo: los de 3D son solo de procesador; la tarjeta gráfica trabaja aparte.
- Las paredes del Castle Kit van a lo largo del eje z, así que necesitan un giro extra de 90°.
- **Decorado sólido:**
  - Los árboles sueltos, rocas («montañitas»), tocones y troncos del claro los coloca la **simulación** (`placeProps` en `sim.ts`, que da `G.props` y `G.solids`). La vista solo los dibuja (`syncProps`), así que cambian en cada partida.
  - Las cantidades y los círculos de choque medidos de cada modelo están en `PROP_KINDS` y `PROP_SOLID` (`config.ts`). Los árboles chocan solo por el tronco. Los troncos caídos son **cápsulas** (`hx`, `hy` en `Solid`), no varios círculos en fila: con círculos los zombis que llegaban de frente se quedaban atascados.
  - `avoidSolids` saca a cualquiera de los obstáculos. Si va de frente, lo desliza de lado para que rodee. Lo usan el jugador, los zombis, los ayudantes y las monedas.
  - Flores, setas, matorrales y el bosque del borde siguen siendo decorativos, y la vista los coloca al azar.
- El castillo dibujado ocupa un cuadrado de medio lado `CASTLE_HALF` = 1,46 (medido del modelo, en todos los niveles). Todas las colisiones con el castillo (jugador, zombis, ayudantes, monedas, navegación) usan ese valor más el radio de cada uno. `BASE_HALF` (1,1) solo se usa para colocar parcelas y para el alcance de las torres.
- Las torres llegan como mucho a 2 piezas intermedias: si son más altas, tapan al jugador.

---

## Audio

- **Muestras** (`public/sounds/`):
  - Golpes de Impact Sounds: impacto de la espada, caída del zombi al morir, mordisco, explosión, construir, mejorar, golpe al castillo y campana del jefe.
  - Pasos en hierba o en tierra.
  - Se cargan tras desbloquear el audio. Si no han cargado, se usa el sonido sintetizado de respaldo.
- **Sintetizado:** monedas (suben de tono si van seguidas), silbido de la espada, gruñido del zombi al morir, tambores y cuerno de guerra al empezar oleada, arco y flechas, arpegios. (El usuario rechazó la campana de oleada, el puñetazo de muerte y el «clinc» metálico de espada, y pidió música menos retro.)
- **Música:** `music.ts`, programada con antelación con `setInterval`. Tiene su propio volumen bajo el general. Se guarda en localStorage (`sg-music`; el silencio general en `sg-muted`).
- Límites: 14 voces simultáneas, separación mínima por sonido (`MIN_GAP`) y volumen según la distancia al jugador.

---

## Decisiones visuales del usuario (respétalas)

- **Sin posprocesado.** Se quitaron GTAO, bloom, corrección de color, FXAA y el selector de calidad. Render directo con `antialias: true`, sombras siempre activas y tono ACES.
- **Sin efectos de partículas** salvo el **polvo al andar** del caballero. Se quitaron chispas, ondas, trocitos, el destello rojo de daño, el temblor de cámara y el «hinchado» de los enemigos al golpearlos.
  - Se mantienen: el destello blanco de los enemigos golpeados, el temblor del castillo al recibir daño, las animaciones de muerte de los modelos y el rebote de las parcelas al mejorarse.
- Quiere un estilo **fantasía medieval** coherente: por eso el peón dejó de ser un obrero de la construcción.
- Hubo «líneas verdes» (rastros de 1 px de la barra de vida del castillo, en CSS2D). Se arreglaron con `will-change: transform; backface-visibility: hidden` en `.labels > *`. El usuario no ha confirmado que hayan desaparecido.

---

## Equilibrio: estado y propuestas pendientes

Análisis de la última partida registrada (oleadas 1–18; en realidad el usuario llegó a más de 90):
- **La forja es demasiado barata.** 3 niveles por 238 monedas dan ×1,95 de daño a **todo**, mientras que las mejoras de torre costaron 1.339.
- **El peón es demasiado rentable.** Cuesta 150 y devolvió 1.327, unas 9 veces lo invertido.
- **El perro deja de servir desde la oleada 8–10.** Mata 0–2 enemigos por oleada y nadie mejora la caseta.
- **El caballero pinta poco a partir de la oleada 7.**
- **Se acumula dinero sin gastar** (350–480 monedas en las mesas): la economía va muy por delante de la dificultad.

Ajustes propuestos al usuario, **todavía sin aplicar ni aprobar**:
1. Forja: coste base de 50 a 120 y multiplicador entre niveles de 1,5 a 1,8.
2. Peón: coste de 150 a 220, o recoger un 25 % menos.
3. Perro: que el daño escale con la oleada y que la primera mejora sea más barata.
4. Enemigos: +10–15 % de vida a partir de la oleada 10, y más crecimiento en partidas largas.

Pregunta al usuario antes de cambiar el equilibrio. Prefiere ver los datos y elegir.

---

## Forma de trabajar con este usuario

- Escribe en español, en tono cercano, y explica los cambios en lenguaje de juego, no de código.
- **Repo público:** https://github.com/pablitofernandez/coinkeep (rama `main`, licencia MIT).
  - Autor de los commits: Pablo Fernández <morfellu@gmail.com>. Está configurado solo en este repo; el global es el correo del trabajo y no debe salir en público.
  - Cada commit lleva `Co-Authored-By: Claude Opus 5.5`.
  - No hagas commit ni push salvo que lo pida. El proyecto se presenta como *vibe coded* con Claude (ver README).
- Cualquier descarga requiere su permiso explícito.
- Comprueba en el navegador cuando el cambio se vea: captura con `zoom` sobre la zona y `advance()` para mover el juego.
- En Windows con Git Bash, los heredocs largos con comillas fallan. Escribe los scripts de edición con la herramienta Write en el scratchpad, o usa Edit directamente.
