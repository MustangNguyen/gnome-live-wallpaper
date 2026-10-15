# Notice and third-party credits

gnome-live-wallpaper is distributed under the GNU General Public License,
version 3 or later (see [LICENSE](LICENSE)). It is built on the following
projects. Their licenses and copyright notices are kept in this repository.

| Component | Upstream | License | Where |
| --- | --- | --- | --- |
| Hanabi GNOME Shell extension | [jeffshee/gnome-ext-hanabi](https://github.com/jeffshee/gnome-ext-hanabi) by Jeff Shee and contributors | GPL-3.0-or-later | `packages/hanabi` (fork imported with full git history) |
| nlohmann/json 3.11.3 | [nlohmann/json](https://github.com/nlohmann/json) | MIT | `packages/native/third_party/json` |
| xdg-shell protocol | [wayland-protocols](https://gitlab.freedesktop.org/wayland/wayland-protocols) 1.45 | MIT (notice inside the XML) | `packages/native/protocol/xdg-shell.xml` |
| three.js | [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT | `wallpapers/starry-night/vendor` |
| *The Starry Night*, Vincent van Gogh (1889) | [Wikimedia Commons / Google Art Project](https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg) | Public domain (PD-Art) | `wallpapers/starry-night/assets` |

## Changes to Hanabi

The fork lives on the `web-wallpaper` branch of
[MustangNguyen/gnome-ext-hanabi](https://github.com/MustangNguyen/gnome-ext-hanabi)
and is imported here with `git subtree`. Compared with upstream it adds:

- HTML wallpapers rendered with WebKitGTK 6 (Wallpaper Engine style
  `project.json` with `general.properties`).
- Pointer forwarding from GNOME Shell to the renderer over D-Bus
  (`setPointer(monitor, x, y, active)`), so wallpapers can react to the cursor.
- Optional shared web view across monitors (`project.json` → `hanabi.sharedView`).
- A *Particle Painting* preferences page for the native renderer.
- A fix for GNOME 50 window previews while a renderer window moves between
  monitors.

The extension keeps Hanabi's UUID `hanabi-extension@jeffshee.github.io`, so it
replaces an installed upstream Hanabi. The installer backs up an existing
upstream copy first. This project is not affiliated with or endorsed by the
Hanabi authors; please report problems here, not upstream.

## Native renderer

`packages/native` is original code for this project. The particle shader and
physics were ported from the HTML wallpaper in `wallpapers/starry-night`. The
renderer design took ideas from NeoWall, but no NeoWall code is included.
