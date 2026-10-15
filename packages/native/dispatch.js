// SPDX-License-Identifier: GPL-3.0-or-later
//
// Installed as the extension's renderer/renderer.js. Hanabi launches it with
// `-F <wallpaper>`; a wallpaper whose project.json sets
// `hanabi.renderer = "native"` runs the native particle renderer, everything
// else (video, HTML) runs Hanabi's WebKit/GStreamer renderer.

import Gio from 'gi://Gio';

const here = Gio.File.new_for_uri(import.meta.url).get_parent();
const index = ARGV.indexOf('-F');
let backend = 'webkit';
try {
    if (index >= 0) {
        const [ok, data] = Gio.File.new_for_path(`${ARGV[index + 1]}/project.json`).load_contents(null);
        if (ok)
            backend = JSON.parse(new TextDecoder().decode(data)).hanabi?.renderer ?? 'webkit';
    }
} catch {
    // Not a directory wallpaper or no project.json: use the default renderer.
}

const nativeAvailable = here.get_child('native').get_child('particle-wallpaper').query_exists(null);
if (backend === 'native' && !nativeAvailable)
    console.warn('Native renderer requested but not installed; falling back to WebKit.');

await import(backend === 'native' && nativeAvailable ? './native/bridge.js' : './renderer-webkit.js');
