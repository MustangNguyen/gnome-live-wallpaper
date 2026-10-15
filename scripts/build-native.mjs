#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Builds the native particle renderer and copies it to
// prebuilt/linux-<arch>/particle-wallpaper for packaging.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNative} from '../lib/native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {version} = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const binary = buildNative(path.join(root, 'build/native'), {test: true, version});
const target = path.join(root, 'prebuilt', `linux-${process.arch}`, 'particle-wallpaper');
fs.mkdirSync(path.dirname(target), {recursive: true});
fs.copyFileSync(binary, target);
fs.chmodSync(target, 0o755);
console.log(`Prebuilt renderer: ${path.relative(root, target)}`);
