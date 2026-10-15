// SPDX-License-Identifier: GPL-3.0-or-later
//
// Locating, validating and building the native particle renderer.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeSource = path.join(packageRoot, 'packages/native');

/** Returns the version line if the binary loads and runs on this system. */
export function probeNative(binary) {
    if (!fs.existsSync(binary))
        return null;
    const result = spawnSync(binary, ['--version'], {encoding: 'utf8', timeout: 5000});
    return result.status === 0 ? result.stdout.trim() : null;
}

export function prebuiltNative() {
    return path.join(packageRoot, 'prebuilt', `linux-${process.arch}`, 'particle-wallpaper');
}

export function haveCommand(command) {
    return spawnSync('sh', ['-c', `command -v ${command}`], {stdio: 'ignore'}).status === 0;
}

/** Missing build tools or pkg-config modules; empty when a source build can run. */
export function missingBuildDeps() {
    const missing = ['cmake', 'c++', 'pkg-config', 'wayland-scanner'].filter(c => !haveCommand(c));
    if (!missing.includes('pkg-config')) {
        for (const module of ['egl', 'glesv2', 'wayland-client', 'wayland-egl', 'gdk-pixbuf-2.0']) {
            if (spawnSync('pkg-config', ['--exists', module]).status !== 0)
                missing.push(`${module} (pkg-config)`);
        }
    }
    return missing;
}

/** Configures and builds with CMake; returns the path to the binary. */
export function buildNative(buildDir, {test = false, version} = {}) {
    const missing = missingBuildDeps();
    if (missing.length)
        throw new Error(`Cannot build native renderer, missing: ${missing.join(', ')}`);
    const run = args => execFileSync(args[0], args.slice(1), {stdio: 'inherit'});
    run(['cmake', '-S', nativeSource, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release',
        `-DBUILD_TESTING=${test ? 'ON' : 'OFF'}`,
        ...(version ? [`-DPARTICLE_WALLPAPER_VERSION=${version}`] : [])]);
    run(['cmake', '--build', buildDir, '--parallel']);
    if (test)
        run(['ctest', '--test-dir', buildDir, '--output-on-failure']);
    return path.join(buildDir, 'particle-wallpaper');
}
