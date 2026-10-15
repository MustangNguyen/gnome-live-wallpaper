# gnome-live-wallpaper

Live wallpapers for GNOME Shell on Wayland. Video, HTML and a native
particle renderer that reacts to your cursor.

This project combines:

- **A fork of [Hanabi](https://github.com/jeffshee/gnome-ext-hanabi)**, the
  GNOME Shell extension that places a renderer window behind the desktop. The
  fork adds HTML wallpapers through WebKitGTK 6 and forwards the cursor to
  wallpapers.
- **A native renderer** (C++17, OpenGL ES 3, Wayland, EGL) for particle
  wallpapers. It replaces a browser engine: about 100 MiB RAM instead of
  about 280 MiB for the earlier Chromium version, measured at 92–98 FPS on 100 Hz displays.
- **Bundled wallpapers**, starting with *Starry Night · Particle Painting*.
- **An npm CLI** that installs and manages all of it for the current user.

See [NOTICE.md](NOTICE.md) for every upstream project, license and change.

## Requirements

- GNOME Shell 50 on Wayland.
- Node.js 18 or newer (for the installer only).
- GStreamer GObject introspection for video wallpapers, and
  `gir1.2-webkit-6.0` for HTML wallpapers (Hanabi's usual dependencies).
- The native renderer ships prebuilt for linux-x64. On other systems the
  installer builds it, which needs `cmake`, a C++17 compiler, `pkg-config`,
  `wayland-scanner` and development files for EGL, GLESv2, wayland-client,
  wayland-egl and gdk-pixbuf-2.0. On Debian/Ubuntu:

  ```bash
  sudo apt install cmake g++ pkg-config libwayland-dev libegl-dev libgles-dev libgdk-pixbuf-2.0-dev
  ```

Run `npx gnome-live-wallpaper doctor` to check your system.

## Install

```bash
npm install -g gnome-live-wallpaper
gnome-live-wallpaper install
```

The installer writes only to your home directory and your GNOME settings:

| Path | Content |
| --- | --- |
| `~/.local/share/gnome-shell/extensions/hanabi-extension@jeffshee.github.io` | Extension and renderers |
| `~/.local/share/glib-2.0/schemas` | Extension settings schema |
| `~/.local/share/gnome-live-wallpaper/wallpapers` | Bundled wallpapers |
| `~/.local/share/gnome-live-wallpaper/backups` | A previous Hanabi installation, if one was replaced |
| `~/.cache/gnome-live-wallpaper` | Native build cache (source builds only) |
| dconf `io.github.jeffshee.hanabi-extension` `video-path` | Current wallpaper |

On Wayland, GNOME Shell loads a newly installed extension only after you log
out and back in. After that, run:

```bash
gnome-extensions enable hanabi-extension@jeffshee.github.io
```

If upstream Hanabi is already installed, the installer backs it up to
`~/.local/share/gnome-live-wallpaper/backups` before replacing it.
`gnome-live-wallpaper restore` puts the newest backup back.

When upgrading, log out and back in so GNOME Shell loads the new extension code.

## Usage

```bash
gnome-live-wallpaper list                 # bundled wallpapers, * marks the current one
gnome-live-wallpaper set starry-night     # bundled name, or a path to a video, HTML file or folder
gnome-live-wallpaper status               # extension state, renderer version, FPS per monitor
gnome-live-wallpaper restart              # restart the renderer
gnome-live-wallpaper install --from-source  # force a native source build
gnome-live-wallpaper uninstall          # add --keep-wallpapers to keep the bundled wallpapers
gnome-live-wallpaper restore            # put back a Hanabi installation saved during install
```

Put your own wallpapers in `~/.local/share/gnome-live-wallpaper/wallpapers/<name>`
and select them with `gnome-live-wallpaper set <name>`. Uninstall removes only
the bundled wallpapers.

Open the preferences with
`gnome-extensions prefs hanabi-extension@jeffshee.github.io`:

- **General**: wallpaper path, playback and auto-pause options (from Hanabi).
- **Particle Painting**: pick any image, preview it, set particle count,
  brightness, return force, damping and the background particle color, then
  *Apply as Wallpaper*. The result is saved in
  `~/.local/share/gnome-live-wallpaper/wallpapers/my-painting`. Changes
  apply immediately; no restart needed.

## Wallpaper format

A wallpaper is a video file, an HTML file, or a folder with a `project.json`:

```json
{
  "title": "My wallpaper",
  "type": "web",
  "file": "index.html",
  "hanabi": { "renderer": "native", "sharedView": false }
}
```

- `hanabi.renderer`: `"native"` uses the native particle renderer (needs
  `preset.json` and an image). Leave it out to render `file` with WebKit.
- `hanabi.sharedView`: `true` renders one web view and mirrors it to all
  monitors. Default `false` runs one independent page per monitor.
- HTML wallpapers receive the cursor through
  `window.wallpaperPointerListener = ({x, y, active}) => {}` with `x` and `y`
  normalized to 0–1 per monitor.

See [wallpapers/starry-night](wallpapers/starry-night) for a complete example.

## Repository layout

```
bin/, lib/          npm CLI
packages/hanabi/    Hanabi fork (git subtree, full upstream history)
packages/native/    native renderer: C++ source, shaders, GJS D-Bus bridge, tests
wallpapers/         bundled wallpapers
scripts/            build scripts for dist/ and prebuilt/
```

## How it works

```
GNOME Shell + Hanabi extension
  │ launches renderer/renderer.js with WAYLAND_SOCKET, sends cursor over D-Bus
  ▼
renderer.js (dispatcher) ── project.json says "native"? ──► native/bridge.js (GJS)
  │ otherwise                                                   │ owns D-Bus name, passes the socket
  ▼                                                             ▼
renderer-webkit.js (Hanabi: GStreamer video / WebKit HTML)   particle-wallpaper (C++/GLES)
                                                               one thread and simulation per monitor
```

Design notes and measurements: [packages/native/docs](packages/native/docs).

## Development

```bash
git clone https://github.com/MustangNguyen/gnome-live-wallpaper
cd gnome-live-wallpaper
npm run build          # build Hanabi and assemble dist/extension
npm run build:native   # build and test the native renderer, copy to prebuilt/
npm run check          # TypeScript typecheck and ESLint for the extension
node bin/gnome-live-wallpaper.mjs install
```

Native renderer only:

```bash
cmake -S packages/native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

Pull upstream Hanabi changes into the subtree:

```bash
git subtree pull --prefix=packages/hanabi https://github.com/jeffshee/gnome-ext-hanabi master
```

## Known limitations

- Tested on one machine: GNOME Shell 50, NVIDIA RTX 3050, two monitors.
- Not yet tested: login/logout cycles, suspend/resume, monitor hotplug and
  fractional scaling with the native renderer.
- The FPS figures in `status` count submitted frames, not frames the display
  actually presented.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
