#!/usr/bin/env node
/**
 * Preflight: `node_modules` must be on the same drive as the source.
 *
 * Why this check exists
 * --------------------
 * This project used to live on E:, a 5400 RPM spinning disk. `node_modules`
 * holds ~75,000 files across ~12,000 directories and Metro touches nearly all
 * of them, so a cold bundle took **13m 08s**. Moving just `node_modules` to the
 * SSD and leaving a junction behind cut that to **1m 10s** - but it silently
 * broke Expo Router, and the failure mode was baffling enough to be worth
 * recording here.
 *
 * `babel-preset-expo` inlines the router's app root as a path relative to
 * `node_modules/expo-router`. With the junction, that package resolved to its
 * real path on C: while the source stayed on E:, and there is no relative path
 * between two Windows drive letters - so Babel emitted an absolute `E:\...`
 * instead. Metro's `require.context` always joins its argument onto the
 * requiring module's directory, producing:
 *
 *     C:/.../node_modules/expo-router/E:/.../Eventerz dApp/src/app
 *
 * That matched zero files, `ctx` came back empty, and Expo Router fell through
 * to its stock "Welcome to Expo - create a file in src/app" screen. The app
 * bundled, ran, threw no errors, and rendered the wrong thing.
 *
 * The whole project now lives on the SSD, so source and dependencies share a
 * drive and both problems are gone. This script guards that invariant, because
 * the symptom is far too indirect to debug twice.
 *
 * Usage:
 *   node scripts/check-deps.mjs          warn on mismatch (used by postinstall)
 *   node scripts/check-deps.mjs --strict exit non-zero on mismatch
 */

import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MODULES = join(PROJECT, 'node_modules');
const strict = process.argv.includes('--strict');

/** Drive letter (`C:`) on Windows, `/` elsewhere. */
function driveOf(path) {
  return parse(resolve(path)).root.replace(/[\\/]$/, '') || '/';
}

const note = (msg) => console.log(`\u25b8 ${msg}`);

if (!existsSync(NODE_MODULES)) {
  note('node_modules is missing. Run "npm install".');
  process.exit(strict ? 1 : 0);
}

// The *real* path is what matters: a junction reports the project's drive but
// resolves to another, which is precisely the case that breaks the router.
const real = realpathSync(NODE_MODULES);
const linked = lstatSync(NODE_MODULES).isSymbolicLink();

const sourceDrive = driveOf(PROJECT);
const depsDrive = driveOf(real);

if (sourceDrive.toLowerCase() === depsDrive.toLowerCase()) {
  note(`node_modules is on ${depsDrive}, same drive as the source. Good.`);
  process.exit(0);
}

console.error(
  [
    '',
    `  x node_modules is on a different drive than the source.`,
    '',
    `      source:       ${PROJECT}  (${sourceDrive})`,
    `      node_modules: ${real}  (${depsDrive})${linked ? '  [via a link]' : ''}`,
    '',
    '    Expo Router will bundle and run but render the stock "Welcome to Expo"',
    '    screen, because its app root cannot be expressed as a path relative to',
    '    node_modules across two drives. See the comment at the top of this file.',
    '',
    `    Fix: move node_modules back beside the source on ${sourceDrive}, or move the`,
    `    whole project onto ${depsDrive}. Do not split them.`,
    '',
  ].join('\n'),
);

process.exit(strict ? 1 : 0);
