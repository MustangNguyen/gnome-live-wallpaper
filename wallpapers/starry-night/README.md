# Starry Night · Particle Painting

Vincent van Gogh's *The Starry Night* (1889) rendered as about 96,000 round,
glowing particles. Moving the cursor pushes particles away; a damped spring
pulls them back home.

The wallpaper ships two implementations of the same simulation:

- **Native** (default, `project.json` → `hanabi.renderer = "native"`): the
  C++17 / OpenGL ES 3 renderer in `packages/native`. Each monitor runs its own
  simulation at 120 Hz physics with 240 Hz cursor interpolation.
- **HTML**: `index.html` with ES modules and three.js. Hanabi uses it through
  WebKitGTK when `hanabi.renderer` is removed, and you can preview it in a
  browser through any static HTTP server.

## Preset

The native renderer reads these keys from `preset.json` at startup:

| Key | Default | Meaning |
| --- | --- | --- |
| `image` | `assets/starry-night.jpg` | Source image, relative to this folder or absolute |
| `brightness` | `0.75` | Overall brightness |
| `spring` | `0.5` | Return force toward the home position |
| `damping` | `0.2` | Velocity damping |

The particle budget (96,000) and cursor interpolation (240 Hz) are fixed in
this release; `particleBudget`, `interactionHz`, `quality` and `fpsCap` are
informational. The HTML version does not read `preset.json`; it uses the
defaults in `index.html`.

To make your own painting, copy this folder, replace the image, update
`preset.json`, then run `gnome-live-wallpaper set /path/to/folder`.

## Credits

- Artwork: public domain, see [assets/ARTWORK.md](assets/ARTWORK.md).
- three.js (MIT): [vendor/THREE-LICENSE](vendor/THREE-LICENSE).
