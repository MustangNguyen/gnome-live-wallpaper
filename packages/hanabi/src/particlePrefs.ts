// Copyright (C) 2026 Mustang Nguyen and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

// "Particle Painting" preferences page: turns an image into a wallpaper for
// the native particle renderer. It writes project.json and preset.json into a
// user wallpaper folder; the renderer bridge restarts when preset.json changes.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-live-wallpaper', 'wallpapers']);
const PAINTING_DIR = GLib.build_filenamev([DATA_DIR, 'my-painting']);
const FALLBACK_IMAGE = GLib.build_filenamev([DATA_DIR, 'starry-night', 'assets', 'starry-night.jpg']);

interface Preset {
    image: string;
    particleBudget: number;
    brightness: number;
    spring: number;
    damping: number;
    backgroundColor: string;
}

const DEFAULTS: Omit<Preset, 'image'> = {
    particleBudget: 96000,
    brightness: 0.75,
    spring: 0.5,
    damping: 0.2,
    backgroundColor: '#000000',
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function readJson(path: string): Record<string, unknown> | null {
    try {
        const [, contents] = Gio.File.new_for_path(path).load_contents(null);
        return JSON.parse(decoder.decode(contents));
    } catch {
        return null;
    }
}

function writeJson(path: string, data: unknown): void {
    // replace_contents writes a temporary file and renames it over the target,
    // so the renderer never reads a half-written preset.
    Gio.File.new_for_path(path).replace_contents(
        encoder.encode(`${JSON.stringify(data, null, 2)}\n`),
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

/** Absolute image path from a preset, or the bundled painting as a starting point. */
function loadPreset(): Preset {
    const saved = readJson(GLib.build_filenamev([PAINTING_DIR, 'preset.json'])) ?? {};
    const number = (key: Exclude<keyof typeof DEFAULTS, 'backgroundColor'>) =>
        typeof saved[key] === 'number' ? saved[key] as number : DEFAULTS[key];
    let image = typeof saved.image === 'string' ? saved.image : '';
    if (image && !GLib.path_is_absolute(image))
        image = GLib.build_filenamev([PAINTING_DIR, image]);
    if (!image || !GLib.file_test(image, GLib.FileTest.EXISTS))
        image = GLib.file_test(FALLBACK_IMAGE, GLib.FileTest.EXISTS) ? FALLBACK_IMAGE : '';
    return {
        image,
        particleBudget: number('particleBudget'),
        brightness: number('brightness'),
        spring: number('spring'),
        damping: number('damping'),
        backgroundColor: typeof saved.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.backgroundColor)
            ? saved.backgroundColor : DEFAULTS.backgroundColor,
    };
}

/**
 * Copies the image into the painting folder and writes the wallpaper files.
 *
 * @param {Preset} preset values and absolute image path to save
 * @returns {string} the painting folder
 */
function savePainting(preset: Preset): string {
    const assets = Gio.File.new_for_path(GLib.build_filenamev([PAINTING_DIR, 'assets']));
    GLib.mkdir_with_parents(assets.get_path()!, 0o755);

    const source = Gio.File.new_for_path(preset.image);
    const name = source.get_basename() ?? 'image';
    const target = assets.get_child(name);
    if (!source.equal(target))
        source.copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);

    // Drop images left over from earlier choices.
    const children = assets.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    for (let info = children.next_file(null); info; info = children.next_file(null)) {
        if (info.get_name() !== name)
            assets.get_child(info.get_name()).delete(null);
    }
    children.close(null);

    writeJson(GLib.build_filenamev([PAINTING_DIR, 'project.json']), {
        title: _('My Particle Painting'),
        type: 'native',
        hanabi: {renderer: 'native'},
    });
    writeJson(GLib.build_filenamev([PAINTING_DIR, 'preset.json']), {
        ...preset,
        image: `assets/${name}`,
    });
    return PAINTING_DIR;
}

function spinRow(
    group: Adw.PreferencesGroup,
    title: string,
    subtitle: string,
    lower: number,
    upper: number,
    step: number,
    digits: number
): Adw.SpinRow {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        digits,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 10}),
    });
    group.add(row);
    return row;
}

function rgbaToHex(rgba: Gdk.RGBA): string {
    const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
    return `#${channel(rgba.red)}${channel(rgba.green)}${channel(rgba.blue)}`;
}

export function particlePaintingPage(window: Adw.PreferencesWindow, settings: Gio.Settings): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
        title: _('Particle Painting'),
        icon_name: 'applications-graphics-symbolic',
    });

    const preset = loadPreset();

    const imageGroup = new Adw.PreferencesGroup({
        title: _('Image'),
        description: _('Turn any image into a wallpaper of glowing particles that react to the cursor.'),
    });
    page.add(imageGroup);

    const picture = new Gtk.Picture({
        content_fit: Gtk.ContentFit.CONTAIN,
        height_request: 220,
        can_shrink: true,
    });
    const frame = new Gtk.Frame({child: picture, margin_bottom: 12});
    imageGroup.add(frame);

    const imageRow = new Adw.ActionRow({title: _('Source Image')});
    const chooseButton = new Adw.ButtonContent({icon_name: 'document-open-symbolic', label: _('Choose')});
    imageRow.add_suffix(chooseButton);
    imageRow.activatable_widget = chooseButton;
    imageGroup.add(imageRow);

    const showImage = () => {
        picture.set_filename(preset.image || null);
        imageRow.subtitle = preset.image ? GLib.path_get_basename(preset.image) : _('None');
    };
    showImage();

    imageRow.connect('activated', () => {
        const filter = new Gtk.FileFilter({name: _('Images')});
        filter.add_pixbuf_formats();
        const dialog = new Gtk.FileDialog({title: _('Choose Image'), modal: true});
        dialog.set_default_filter(filter);
        if (preset.image)
            dialog.set_initial_file(Gio.File.new_for_path(preset.image));
        dialog.open(window, null, (_dialog, result) => {
            try {
                const path = dialog.open_finish(result)?.get_path();
                if (path) {
                    preset.image = path;
                    showImage();
                }
            } catch {
                // Dialog dismissed.
            }
        });
    });

    const lookGroup = new Adw.PreferencesGroup({title: _('Particles')});
    page.add(lookGroup);
    const particles = spinRow(lookGroup, _('Particle Count'),
        _('More particles show more detail and use more GPU time'), 20000, 250000, 1000, 0);
    const brightness = spinRow(lookGroup, _('Brightness'), '', 0.2, 1.5, 0.05, 2);
    const spring = spinRow(lookGroup, _('Return Force'),
        _('How quickly particles fly back to the image'), 0.1, 3, 0.05, 2);
    const damping = spinRow(lookGroup, _('Damping'),
        _('Low values let particles drift longer'), 0.2, 6, 0.1, 1);
    const backgroundRow = new Adw.ActionRow({
        title: _('Background Color'),
        subtitle: _('Color of the particles that fill the screen around the image'),
    });
    const backgroundButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({title: _('Background Color'), with_alpha: false}),
        valign: Gtk.Align.CENTER,
    });
    backgroundRow.add_suffix(backgroundButton);
    backgroundRow.activatable_widget = backgroundButton;
    lookGroup.add(backgroundRow);

    const showValues = () => {
        particles.value = preset.particleBudget;
        brightness.value = preset.brightness;
        spring.value = preset.spring;
        damping.value = preset.damping;
        const color = new Gdk.RGBA();
        color.parse(preset.backgroundColor);
        backgroundButton.rgba = color;
    };
    showValues();

    const actionGroup = new Adw.PreferencesGroup();
    page.add(actionGroup);
    const buttons = new Gtk.Box({spacing: 12, halign: Gtk.Align.CENTER, margin_top: 12});
    const resetButton = new Gtk.Button({label: _('Reset Values'), css_classes: ['pill']});
    const applyButton = new Gtk.Button({label: _('Apply as Wallpaper'), css_classes: ['pill', 'suggested-action']});
    buttons.append(resetButton);
    buttons.append(applyButton);
    actionGroup.add(buttons);

    resetButton.connect('clicked', () => {
        Object.assign(preset, DEFAULTS);
        showValues();
    });

    applyButton.connect('clicked', () => {
        if (!preset.image) {
            window.add_toast(new Adw.Toast({title: _('Choose an image first')}));
            return;
        }
        preset.particleBudget = Math.round(particles.value);
        preset.brightness = brightness.value;
        preset.spring = spring.value;
        preset.damping = damping.value;
        preset.backgroundColor = rgbaToHex(backgroundButton.rgba);
        try {
            const folder = savePainting(preset);
            preset.image = GLib.build_filenamev([folder, 'assets', GLib.path_get_basename(preset.image)]);
            // A new path relaunches the renderer; for the same path the
            // renderer restarts itself because preset.json changed.
            if (settings.get_string('video-path') !== folder)
                settings.set_string('video-path', folder);
            window.add_toast(new Adw.Toast({title: _('Wallpaper updated')}));
        } catch (e) {
            console.error(e);
            window.add_toast(new Adw.Toast({title: `${_('Could not save the painting')}: ${(e as Error).message}`}));
        }
    });

    return page;
}
