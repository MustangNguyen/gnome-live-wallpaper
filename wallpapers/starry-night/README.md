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
| `particleBudget` | `96000` | Particle count (20,000–250,000), rounded to the image grid |

The renderer restarts by itself when `preset.json` changes. Cursor
interpolation (240 Hz) is fixed; `interactionHz`, `quality` and `fpsCap` are
informational. The HTML version does not read `preset.json`; it uses the
defaults in `index.html`.

The easiest way to make your own painting is the **Particle Painting** page in
the extension preferences. To do it by hand, copy this folder, replace the
image, update `preset.json`, then run `gnome-live-wallpaper set /path/to/folder`.

## Credits

- Artwork: public domain, see [assets/ARTWORK.md](assets/ARTWORK.md).
- three.js (MIT): [vendor/THREE-LICENSE](vendor/THREE-LICENSE).
