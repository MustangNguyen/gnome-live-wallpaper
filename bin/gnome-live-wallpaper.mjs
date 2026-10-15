#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// gnome-live-wallpaper: installs the Hanabi fork, the native particle renderer
// and bundled wallpapers for the current user, then manages them.

import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildNative, haveCommand, missingBuildDeps, nativeSource, packageRoot, prebuiltNative, probeNative,
} from '../lib/native.mjs';

const UUID = 'hanabi-extension@jeffshee.github.io';
const SCHEMA = 'io.github.jeffshee.hanabi-extension';
const MARKER = 'gnome-live-wallpaper';

const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const home = os.homedir();
const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local/share');
const cacheHome = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
// One build directory per package version and source location: CMake refuses
// to reuse a cache generated for a different source directory.
const buildKey = crypto.createHash('sha256').update(`${pkg.version}:${nativeSource}`).digest('hex').slice(0, 12);
const paths = {
    extension: path.join(dataHome, 'gnome-shell/extensions', UUID),
    schemas: path.join(dataHome, 'glib-2.0/schemas'),
    state: path.join(dataHome, MARKER),
    staging: path.join(dataHome, MARKER, 'staging'),
    wallpapers: path.join(dataHome, MARKER, 'wallpapers'),
    backups: path.join(dataHome, MARKER, 'backups'),
    cache: path.join(cacheHome, MARKER),
    build: path.join(cacheHome, MARKER, `native-build-${buildKey}`),
    metrics: path.join(runtimeDir, 'hanabi-native-metrics.json'),
};
const dist = path.join(packageRoot, 'dist/extension');
const bundledWallpapers = path.join(packageRoot, 'wallpapers');

const log = message => console.log(message);
const warn = message => console.warn(`warning: ${message}`);

function run(command, args, {quiet = false} = {}) {
    const result = spawnSync(command, args, {encoding: 'utf8'});
    if (!quiet && result.status !== 0 && result.stderr)
        process.stderr.write(result.stderr);
    return result;
}

const COMMAND_FLAGS = {
    install: ['wallpaper', 'from-source', 'no-native', 'no-enable'],
    uninstall: ['keep-wallpapers', 'force'],
    restore: [],
};

function parseArgs(argv) {
    const flags = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--') || arg === '--') {
            positional.push(arg);
            continue;
        }
        const body = arg.slice(2);
        const eq = body.indexOf('=');
        const key = eq < 0 ? body : body.slice(0, eq);
        if (eq >= 0)
            flags[key] = body.slice(eq + 1);
        else if (key === 'wallpaper' && argv[i + 1] && !argv[i + 1].startsWith('--'))
            flags[key] = argv[++i];
        else
            flags[key] = true;
    }
    const allowed = [...(COMMAND_FLAGS[positional[0]] ?? []), 'help', 'version'];
    const unknown = Object.keys(flags).filter(key => !allowed.includes(key));
    if (unknown.length)
        throw new Error(`Unknown option ${unknown.map(key => `--${key}`).join(', ')}. Run \`${MARKER} help\`.`);
    return {flags, positional};
}

function shellMajor() {
    const result = run('gnome-shell', ['--version'], {quiet: true});
    const match = result.stdout?.match(/(\d+)/);
    return match ? Number(match[1]) : null;
}

function supportedShells() {
    try {
        return JSON.parse(fs.readFileSync(path.join(dist, 'metadata.json'), 'utf8'))['shell-version'].map(Number);
    } catch {
        return [];
    }
}

/** Returns {enabled, state} as GNOME Shell sees the extension, or null. */
function extensionInfo() {
    if (!haveCommand('gnome-extensions'))
        return null;
    const result = run('gnome-extensions', ['info', UUID], {quiet: true});
    if (result.status !== 0)
        return null;
    return {
        enabled: /Enabled:\s*Yes/i.test(result.stdout),
        state: result.stdout.match(/State:\s*(\S+)/)?.[1] ?? 'UNKNOWN',
    };
}

function readMetadata(dir) {
    const file = path.join(dir, 'metadata.json');
    if (!fs.existsSync(file))
        return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
}

const isOurs = dir => (readMetadata(dir)?.name ?? '').includes(MARKER);

function gsettings(...args) {
    return run('gsettings', args, {quiet: true});
}

function currentWallpaper() {
    const result = gsettings('get', SCHEMA, 'video-path');
    if (result.status !== 0)
        return null;
    return result.stdout.trim().replace(/^'|'$/g, '');
}

/** Resolves a bundled wallpaper name or a directory/file path. */
function resolveWallpaper(target) {
    if (typeof target !== 'string' || !target)
        throw new Error('Expected a wallpaper name or path.');
    if (!target.includes('/') && fs.existsSync(path.join(bundledWallpapers, target)))
        return path.join(paths.wallpapers, target);
    const installed = path.join(paths.wallpapers, target);
    if (fs.existsSync(installed))
        return installed;
    const resolved = path.resolve(target);
    if (fs.existsSync(resolved))
        return resolved;
    throw new Error(`Wallpaper not found: ${target}. Run \`${MARKER} list\`.`);
}

function setWallpaperPath(wallpaper) {
    const result = gsettings('set', SCHEMA, 'video-path', wallpaper);
    if (result.status !== 0)
        throw new Error(`gsettings failed: ${result.stderr?.trim() || result.error?.message}`);
    log(`Wallpaper: ${wallpaper}`);
}

function enableExtension() {
    if (!haveCommand('gnome-extensions')) {
        warn('gnome-extensions not found; enable the extension from the Extensions app.');
        return false;
    }
    return run('gnome-extensions', ['enable', UUID], {quiet: true}).status === 0;
}

function installNative(extensionDir, flags) {
    const target = path.join(extensionDir, 'renderer/native/particle-wallpaper');
    let source = null;
    if (!flags['from-source']) {
        const prebuilt = prebuiltNative();
        if (probeNative(prebuilt))
            source = prebuilt;
        else if (fs.existsSync(prebuilt))
            log('Prebuilt native renderer does not run on this system; building from source.');
        else
            log(`No prebuilt native renderer for linux-${process.arch}; building from source.`);
    }
    if (!source) {
        try {
            source = buildNative(paths.build, {version: pkg.version});
        } catch (error) {
            warn(`${error.message}\nNative wallpapers will fall back to the WebKit renderer.`);
            return;
        }
    }
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o755);
    log(`Native renderer: ${probeNative(target) ?? 'installed'}`);
}

/** Saves an extension directory this tool did not install. */
function backupForeignExtension() {
    let stat;
    try {
        stat = fs.lstatSync(paths.extension);
    } catch {
        return;
    }
    if (isOurs(paths.extension))
        return;
    const backup = path.join(paths.backups, `${UUID}-${Date.now()}`);
    fs.mkdirSync(paths.backups, {recursive: true});
    if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(paths.extension);
        fs.symlinkSync(target, backup);
        log(`Existing extension was a symlink to ${target}; link saved as ${backup}`);
    } else {
        fs.cpSync(paths.extension, backup, {recursive: true});
        log(`Existing extension backed up to ${backup}`);
    }
}

function replaceDir(from, to) {
    fs.rmSync(to, {recursive: true, force: true});
    fs.mkdirSync(path.dirname(to), {recursive: true});
    try {
        fs.renameSync(from, to);
    } catch (error) {
        if (error.code !== 'EXDEV')
            throw error;
        fs.cpSync(from, to, {recursive: true});
        fs.rmSync(from, {recursive: true, force: true});
    }
}

function compileSchemas() {
    const result = run('glib-compile-schemas', [paths.schemas]);
    if (result.status !== 0)
        throw new Error(`glib-compile-schemas failed for ${paths.schemas}`);
}

function install(flags) {
    // Preflight: everything that can fail without side effects runs first.
    if (process.platform !== 'linux')
        throw new Error('gnome-live-wallpaper only supports Linux with GNOME Shell.');
    if (!fs.existsSync(path.join(dist, 'metadata.json')))
        throw new Error('dist/extension is missing; run `npm run build` in a source checkout.');
    const missing = ['gsettings', 'glib-compile-schemas'].filter(command => !haveCommand(command));
    if (missing.length)
        throw new Error(`Missing ${missing.join(', ')} (install libglib2.0-bin or your distribution's equivalent).`);
    const wallpaper = flags.wallpaper === undefined ? null : resolveWallpaper(flags.wallpaper);
    const major = shellMajor();
    const supported = supportedShells();
    if (major === null)
        warn('gnome-shell not found; installing files anyway.');
    else if (!supported.includes(major))
        warn(`GNOME Shell ${major} detected; this release supports GNOME Shell ${supported.join(', ')}. The shell may refuse the extension.`);

    // Stage the new extension next to the final location, native renderer included.
    fs.rmSync(paths.staging, {recursive: true, force: true});
    fs.mkdirSync(path.dirname(paths.staging), {recursive: true});
    fs.cpSync(dist, paths.staging, {recursive: true});
    if (!flags['no-native'])
        installNative(paths.staging, flags);

    const before = extensionInfo();
    // GJS caches loaded modules, so replaced extension code runs only after relogin.
    const replacing = before !== null;
    if (before?.enabled)
        run('gnome-extensions', ['disable', UUID], {quiet: true});
    try {
        backupForeignExtension();
        replaceDir(paths.staging, paths.extension);
        log(`Extension: ${paths.extension}`);

        fs.mkdirSync(paths.schemas, {recursive: true});
        fs.copyFileSync(path.join(dist, 'schemas', `${SCHEMA}.gschema.xml`),
            path.join(paths.schemas, `${SCHEMA}.gschema.xml`));
        compileSchemas();

        // Refresh bundled wallpapers only; other folders here belong to the user.
        fs.mkdirSync(paths.wallpapers, {recursive: true});
        for (const entry of fs.readdirSync(bundledWallpapers)) {
            fs.rmSync(path.join(paths.wallpapers, entry), {recursive: true, force: true});
            fs.cpSync(path.join(bundledWallpapers, entry), path.join(paths.wallpapers, entry), {recursive: true});
        }
        log(`Wallpapers: ${paths.wallpapers}`);

        const current = currentWallpaper();
        if (wallpaper)
            setWallpaperPath(wallpaper);
        else if (!current || !fs.existsSync(current))
            setWallpaperPath(path.join(paths.wallpapers, 'starry-night'));
    } finally {
        // Restore the previous enabled state even if a step above failed.
        if (before?.enabled || !flags['no-enable']) {
            if (enableExtension()) {
                log(replacing
                    ? 'Extension re-enabled. Log out and back in to load the updated extension code.'
                    : 'Extension enabled.');
            } else if (haveCommand('gnome-extensions')) {
                log(`\nGNOME Shell on Wayland loads new extensions after you log out and back in.
Then run: gnome-extensions enable ${UUID}`);
            }
        }
    }
}

function latestBackup() {
    if (!fs.existsSync(paths.backups))
        return null;
    const entries = fs.readdirSync(paths.backups).filter(name => name.startsWith(UUID)).sort();
    return entries.length ? path.join(paths.backups, entries.at(-1)) : null;
}

function uninstall(flags) {
    const present = fs.existsSync(paths.extension) || fs.lstatSync(paths.extension, {throwIfNoEntry: false});
    if (present && !isOurs(paths.extension) && !flags.force) {
        throw new Error(`${paths.extension} was not installed by ${MARKER}; refusing to remove it. ` +
            'Use --force to remove it anyway.');
    }
    if (extensionInfo())
        run('gnome-extensions', ['disable', UUID], {quiet: true});
    fs.rmSync(paths.extension, {recursive: true, force: true});

    const current = currentWallpaper();
    if (current && current.startsWith(`${paths.state}/`))
        gsettings('reset', SCHEMA, 'video-path');

    const schema = path.join(paths.schemas, `${SCHEMA}.gschema.xml`);
    if (fs.existsSync(schema)) {
        fs.rmSync(schema);
        if (haveCommand('glib-compile-schemas'))
            run('glib-compile-schemas', [paths.schemas], {quiet: true});
    }

    if (!flags['keep-wallpapers'] && fs.existsSync(paths.wallpapers)) {
        for (const entry of fs.readdirSync(bundledWallpapers))
            fs.rmSync(path.join(paths.wallpapers, entry), {recursive: true, force: true});
        if (fs.readdirSync(paths.wallpapers).length === 0)
            fs.rmdirSync(paths.wallpapers);
        else
            log(`Kept your own wallpapers in ${paths.wallpapers}`);
    }
    fs.rmSync(paths.cache, {recursive: true, force: true});
    fs.rmSync(paths.staging, {recursive: true, force: true});
    log('Removed extension, settings schema, bundled wallpapers and build cache.');

    const backup = latestBackup();
    if (backup)
        log(`A previous Hanabi installation is saved in ${backup}. Run \`${MARKER} restore\` to put it back.`);
}

function restore() {
    const backup = latestBackup();
    if (!backup)
        throw new Error(`No backup in ${paths.backups}.`);
    if (fs.existsSync(paths.extension) && !isOurs(paths.extension))
        throw new Error(`${paths.extension} exists and was not installed by ${MARKER}; remove it first.`);
    if (extensionInfo())
        run('gnome-extensions', ['disable', UUID], {quiet: true});
    replaceDir(backup, paths.extension);
    log(`Restored ${backup} to ${paths.extension}. Log out and back in, then enable the extension.`);
}

function list() {
    const current = currentWallpaper();
    const dir = fs.existsSync(paths.wallpapers) ? paths.wallpapers : bundledWallpapers;
    for (const name of fs.readdirSync(dir)) {
        let title = name;
        try {
            title = JSON.parse(fs.readFileSync(path.join(dir, name, 'project.json'), 'utf8')).title ?? name;
        } catch {
            // Wallpaper without project.json.
        }
        const mark = current === path.join(dir, name) ? '*' : ' ';
        log(`${mark} ${name.padEnd(20)} ${title}`);
    }
}

function status() {
    log(`gnome-live-wallpaper ${pkg.version}`);
    log(`GNOME Shell: ${shellMajor() ?? 'not found'}`);
    const info = extensionInfo();
    const files = fs.existsSync(paths.extension)
        ? (isOurs(paths.extension) ? 'installed' : 'installed by another source')
        : 'not installed';
    log(`Extension files: ${files}`);
    log(`Extension state: ${info ? `${info.state}${info.enabled ? '' : ' (disabled)'}` : 'unknown to GNOME Shell (log out and back in after a new install)'}`);
    log(`Wallpaper: ${currentWallpaper() ?? 'unknown'}`);
    const native = path.join(paths.extension, 'renderer/native/particle-wallpaper');
    log(`Native renderer: ${probeNative(native) ?? 'not installed'}`);
    if (fs.existsSync(paths.metrics))
        log(`Native metrics:\n${fs.readFileSync(paths.metrics, 'utf8')}`);
}

function restart() {
    if (!haveCommand('gnome-extensions'))
        throw new Error('gnome-extensions not found.');
    run('gnome-extensions', ['disable', UUID]);
    if (!enableExtension())
        throw new Error('Enable failed; log out and back in if the extension was just installed.');
    log('Renderer restarted.');
}

function doctor() {
    let failed = false;
    const check = (ok, label, hint = '', {required = true} = {}) => {
        if (!ok && required)
            failed = true;
        log(`${ok ? 'ok  ' : required ? 'FAIL' : 'info'} ${label}${!ok && hint ? ` — ${hint}` : ''}`);
    };
    const major = shellMajor();
    const supported = supportedShells();
    check(major !== null && supported.includes(major), `GNOME Shell ${major ?? 'missing'}`, `supported: ${supported.join(', ')}`);
    check(process.env.XDG_SESSION_TYPE === 'wayland', `session ${process.env.XDG_SESSION_TYPE ?? 'unknown'}`, 'Wayland is required');
    for (const command of ['gnome-extensions', 'gsettings', 'glib-compile-schemas', 'gjs'])
        check(haveCommand(command), command);
    const gst = run('gjs', ['-c', "imports.gi.versions.Gst='1.0';imports.gi.Gst"], {quiet: true});
    check(gst.status === 0, 'GStreamer GObject introspection', 'needed for video wallpapers', {required: false});
    const webkit = run('gjs', ['-c', "imports.gi.versions.WebKit='6.0';imports.gi.WebKit"], {quiet: true});
    check(webkit.status === 0, 'WebKitGTK 6.0 introspection', 'needed for HTML wallpapers (gir1.2-webkit-6.0)', {required: false});
    const prebuilt = Boolean(probeNative(prebuiltNative()));
    const buildMissing = missingBuildDeps();
    check(prebuilt, `prebuilt native renderer (linux-${process.arch})`, 'a source build is needed', {required: false});
    check(buildMissing.length === 0, 'native build dependencies', `missing ${buildMissing.join(', ')}`, {required: !prebuilt});
    if (failed)
        process.exitCode = 1;
}

const HELP = `gnome-live-wallpaper ${pkg.version}

Usage: gnome-live-wallpaper <command> [options]

Commands:
  install [--wallpaper <name|path>] [--from-source] [--no-native] [--no-enable]
                     Install the extension, native renderer and wallpapers
  uninstall [--keep-wallpapers] [--force]
                     Remove what this tool installed
  restore            Put back the Hanabi installation saved during install
  list               List installed wallpapers (* = current)
  set <name|path>    Use a wallpaper (bundled name, directory, video or HTML)
  status             Show extension, renderer and FPS metrics
  restart            Restart the renderer
  doctor             Check system requirements
`;

try {
    const {flags, positional} = parseArgs(process.argv.slice(2));
    const [command, target] = positional;
    switch (command) {
    case 'install': install(flags); break;
    case 'uninstall': uninstall(flags); break;
    case 'restore': restore(); break;
    case 'list': list(); break;
    case 'set':
        if (!target)
            throw new Error('Usage: gnome-live-wallpaper set <name|path>');
        setWallpaperPath(resolveWallpaper(target));
        break;
    case 'status': status(); break;
    case 'restart': restart(); break;
    case 'doctor': doctor(); break;
    case 'version': log(pkg.version); break;
    default:
        if (flags.version) {
            log(pkg.version);
            break;
        }
        process.stdout.write(HELP);
        if (command && command !== 'help')
            process.exitCode = 1;
    }
} catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
}
