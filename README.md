# Volute

An arcade mineral puzzle in a geothermal pump hall. Fire into the moving train to gather three matching charges, open gaps, and build merge chains before the minerals reach the intake. Five halls share one spiral channel; three power cells keep the run alive.

Minerals carry distinct colors and glyphs. Every twelfth feed core bears a machinery mark: choke slows the feed, backflow reverses it, bore clears a nearby area, and sightline reveals the aim ray.

## Run

Requires a current Node.js release compatible with Vite 8.

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

Publish the contents of `dist/` to any static host. Assets and URLs are relative, so the game also works beneath a sub-path. There is no backend, external service, or runtime asset generation.

## Controls

| Control                            | Action                          |
| ---------------------------------- | ------------------------------- |
| Pointer or left/right arrows (A/D) | Aim                             |
| Click, tap, or Space               | Fire                            |
| X                                  | Swap loaded and queued minerals |
| P or Escape                        | Pause / resume                  |
| M                                  | Mute / unmute                   |
| Enter, Space, click, or tap        | Start / dismiss an ending       |
| Backtick                           | Engine diagnostics              |

Touch controls appear on touch input. Sound unlocks on the first gesture.

## Development

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Simple 2D engine owns input, audio, assets, frame timing, canvas fit, and diagnostics. The simulation runs at a fixed 60 Hz independently of rendering. The typed debug surface returned through `engine.debug` supports immutable scenario poses and snapshots; it exposes nothing globally.

The committed pixel art, animation frames, four live particle systems, thirteen sound effects, and two sequenced music beds are in `public/assets/`. `tools/produce_assets.py` records their one-time production using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`, followed by PCM mastering. Those tools are authoring dependencies only and are never called by installation or production builds. The music MIDI files are included alongside the playable WAV files.
