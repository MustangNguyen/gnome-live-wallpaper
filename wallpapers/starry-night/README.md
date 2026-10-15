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

`preset.json` is read by both implementations:

| Key | Default | Meaning |
| --- | --- | --- |
| `image` | `assets/starry-night.jpg` | Source image, relative to this folder (native renderer) |
| `damping` | `0.2` | Velocity damping |
| `spring` | `0.5` | Return force toward the home position |
| `brightness` | `0.75` | Overall brightness |
| `particleBudget` | `96000` | Particle budget, rounded to the image grid |
| `interactionHz` | `240` | Cursor interpolation rate |

To make your own painting, copy this folder, replace the image, update
`preset.json`, then run `gnome-live-wallpaper set /path/to/folder`.

## Credits

- Artwork: public domain, see [assets/ARTWORK.md](assets/ARTWORK.md).
- three.js (MIT): [vendor/THREE-LICENSE](vendor/THREE-LICENSE).
