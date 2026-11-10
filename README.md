# 🪙 Coinkeep

**[▶ Play it in your browser](https://pablitofernandez.github.io/coinkeep/)**. It works on desktop and mobile, with no install.

An isometric *tower defense* game for the browser. You play a rogue defending a castle from waves of zombies. Slay enemies, carry an ever-growing stack of coins on your back, and spend it by standing on build plots. Raise towers, upgrade them, forge better weapons, and hire wolves and peasants to help you.

> **Vibe coded.** This game was made by **Pablo Fernández** in conversation with **Claude Opus 5.5** (Anthropic), using Claude Code. Pablo directed the design, art style, balancing and playtesting. Claude wrote practically all of the code, the synthesized music and the sound effects.
>
> The game's interface is in Spanish.

## How to play

- **Move:** arrow keys or WASD. On mobile, drag your finger anywhere on the screen (virtual joystick).
- **Attack:** the rogue attacks on their own. They use the dagger when a zombie is close and the crossbow when it's farther away.
- **Money:** pick up coins from the ground and from the loot tables next to your towers.
- **Build:** stand on a plot for a moment to pay for it.
  - 🏹 **Archer tower** and 💣 **cannon**: defend on their own and can be upgraded up to level 7.
  - 💪 **Strength**: more damage for your dagger and crossbow.
  - 🔨 **Forge**: multiplies the damage of everything.
  - 🏰 **Repair**: heals and expands the castle.
  - 🐺 **Wolves**: gather coins from the ground and bite zombies.
  - 🧔 **Peasants**: empty the towers' loot tables and bring you the money.
- **Sound:** `M` mutes the game and `N` toggles the music.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server runs with `--host`, so you can also play from your phone at `http://<your-PC-IP>:5173`.

Other commands:
- `npm run build`: type-checks and builds the production version into `dist/`.
- `npm run typecheck`: type-checks only.

Every push to `main` is built and deployed to GitHub Pages automatically (`.github/workflows/pages.yml`).

### Developer menu

In development mode, press **F1** or the key left of **1** (on mobile, tap the wave counter three times). From there you can:
- Spawn zombies and bosses, or jump to any wave.
- Change the castle's health, give yourself coins, or build everything.
- Speed up or pause time, or simulate whole games with an autopilot.
- See collision shapes and ranges, play each sound effect, and follow live game stats.

It isn't included in the production build.

## Tech

- [Three.js](https://threejs.org/): isometric orthographic camera, shadows, GLB models, skeletal animation and instancing.
- Strict TypeScript and [Vite](https://vite.dev/).
- WebAudio:
  - Sound effects: recorded samples layered with synthesized tones.
  - Fantasy music synthesized in real time: flute, Karplus-Strong harp, strings, cello and drums, with reverb.
- Fixed-step simulation, fully separated from rendering (`src/game/` knows nothing about Three.js).

## Asset credits

All models and sounds are **CC0** (public domain). Many thanks to their authors:

- **[Kenney](https://kenney.nl)**:
  - [Mini Characters](https://kenney.nl/assets/mini-characters)
  - [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit)
  - [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit)
  - [Castle Kit](https://kenney.nl/assets/castle-kit)
  - [Nature Kit](https://kenney.nl/assets/nature-kit)
  - [Impact Sounds](https://kenney.nl/assets/impact-sounds)
- **[KayKit](https://kaylousberg.com)** (Kay Lousberg): Adventurers 2.0, for the rogue, the dagger, the crossbow and the animations.
- **[Quaternius](https://quaternius.com)**: Ultimate Animated Animals, for the wolf.

See [`public/models/CREDITS.txt`](public/models/CREDITS.txt) for exactly what is used from each pack.

## License

The code is released under the [MIT License](LICENSE), © 2026 Pablo Fernández. The models and sounds in `public/` keep their original CC0 license.
