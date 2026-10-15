#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Assembles dist/extension: the Hanabi extension tree that the CLI copies to
// ~/.local/share/gnome-shell/extensions/<uuid>. Users installing from npm get
// this prebuilt tree and never need the TypeScript toolchain.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hanabi = path.join(root, 'packages/hanabi');
const native = path.join(root, 'packages/native');
const out = path.join(root, 'dist/extension');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const UUID = 'hanabi-extension@jeffshee.github.io';
const SCHEMA = 'io.github.jeffshee.hanabi-extension';

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, {cwd, stdio: 'inherit'});
const copy = (from, to) => {
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.cpSync(from, to, {recursive: true});
};

if (!fs.existsSync(path.join(hanabi, 'node_modules')))
    run('npm', ['ci', '--no-audit', '--no-fund'], hanabi);
run('npm', ['run', 'build'], hanabi);

fs.rmSync(out, {recursive: true, force: true});
const built = path.join(hanabi, 'src/_build');

const metadata = fs.readFileSync(path.join(hanabi, 'src/metadata.json.in'), 'utf8')
    .replaceAll('@uuid@', UUID)
    .replaceAll('@settings_schema@', SCHEMA)
    .replaceAll('@version@', '1');
const meta = JSON.parse(metadata);
meta.name = 'Hanabi Extension (gnome-live-wallpaper)';
meta.url = pkg.homepage;
meta['version-name'] = pkg.version;
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'metadata.json'), `${JSON.stringify(meta, null, 2)}\n`);

copy(path.join(built, 'extension.js'), path.join(out, 'extension.js'));
copy(path.join(built, 'prefs.js'), path.join(out, 'prefs.js'));
copy(path.join(hanabi, 'LICENSE'), path.join(out, 'LICENSE'));
copy(path.join(hanabi, 'src/assets/hanabi-symbolic.svg'), path.join(out, 'hanabi-symbolic.svg'));

// Renderer: dispatcher picks native or Hanabi's WebKit/GStreamer renderer.
copy(path.join(built, 'renderer.js'), path.join(out, 'renderer/renderer-webkit.js'));
copy(path.join(hanabi, 'src/renderer/stylesheet.css'), path.join(out, 'renderer/stylesheet.css'));
copy(path.join(native, 'dispatch.js'), path.join(out, 'renderer/renderer.js'));
copy(path.join(native, 'bridge.js'), path.join(out, 'renderer/native/bridge.js'));
copy(path.join(native, 'shaders'), path.join(out, 'renderer/native/shaders'));

// GSettings schema, also compiled locally so Extension.getSettings() finds it.
const schemas = path.join(out, 'schemas');
copy(path.join(hanabi, `src/schemas/${SCHEMA}.gschema.xml`), path.join(schemas, `${SCHEMA}.gschema.xml`));
run('glib-compile-schemas', [schemas]);

// Translations.
const po = path.join(hanabi, 'src/po');
for (const lang of fs.readFileSync(path.join(po, 'LINGUAS'), 'utf8').split(/\s+/).filter(Boolean)) {
    const dir = path.join(out, 'locale', lang, 'LC_MESSAGES');
    fs.mkdirSync(dir, {recursive: true});
    run('msgfmt', [path.join(po, `${lang}.po`), '-o', path.join(dir, `${UUID}.mo`)]);
}

console.log(`Assembled ${path.relative(root, out)}`);
