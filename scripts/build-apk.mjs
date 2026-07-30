#!/usr/bin/env node
/**
 * Build a standalone APK you can install on a real phone.
 *
 *   npm run apk            → release APK, arm64 (dApp Store submission)
 *   npm run apk -- --debug → debug APK that still needs Metro
 *   npm run apk -- --all   → all ABIs (slower; only needed for wide release)
 *
 * Why this is separate from `npm run android`:
 *
 * A *debug* build loads its JavaScript from Metro at runtime, so the phone has
 * to be on your network with the dev server up. A *release* build bundles the
 * JS into the APK — it runs standalone, which is what you need for real
 * device testing away from your machine and for submission.
 *
 * Signing: the release buildType is configured to sign with the debug keystore
 * (android/app/build.gradle), so the APK installs on any phone. That is fine
 * for testing and sideloading. Before submitting to the Solana dApp Store,
 * replace it with your own upload key — see
 * https://reactnative.dev/docs/signed-apk-android
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const IS_WINDOWS = platform() === 'win32';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug');
const allAbis = args.includes('--all');

const log = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const die = (m) => {
  console.error(`\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

function resolveSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const localProps = join(ROOT, 'android', 'local.properties');
  if (existsSync(localProps)) {
    const m = /^sdk\.dir=(.+)$/m.exec(readFileSync(localProps, 'utf8'));
    if (m) candidates.push(m[1].replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }
  candidates.push('C:\\AndroidSDK\\Sdk');
  for (const d of candidates) {
    if (d && existsSync(join(d, 'platform-tools'))) return d;
  }
  die('Could not find the Android SDK. Set ANDROID_HOME.');
}

const SDK = resolveSdk();

const abis = allAbis ? 'arm64-v8a,armeabi-v7a,x86,x86_64' : 'arm64-v8a';
const variant = isDebug ? 'Debug' : 'Release';
const gradlew = join(ROOT, 'android', IS_WINDOWS ? 'gradlew.bat' : 'gradlew');

const gradleArgs = [
  `:app:assemble${variant}`,
  `-PreactNativeArchitectures=${abis}`,
  '--console=plain',
];

log(`Building ${variant.toLowerCase()} APK for ${abis}…`);
if (!isDebug) {
  log('Release bundles the JS, so the APK runs without Metro.');
  log('Signed with the debug keystore — fine for sideloading, not for the store.');
}

const result = spawnSync(gradlew, gradleArgs, {
  cwd: join(ROOT, 'android'),
  stdio: 'inherit',
  env: { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK },
});

if (result.status !== 0) die('Build failed — see the output above.');

const apk = join(
  ROOT, 'android', 'app', 'build', 'outputs', 'apk',
  variant.toLowerCase(), `app-${variant.toLowerCase()}.apk`,
);

console.log('');
if (existsSync(apk)) {
  const sizeMb = (
    execFileSync(
      IS_WINDOWS ? 'powershell' : 'stat',
      IS_WINDOWS
        ? ['-c', `(Get-Item '${apk}').Length`]
        : ['-f', '%z', apk],
      { encoding: 'utf8' },
    ).trim() / (1024 * 1024)
  ).toFixed(1);

  log(`APK ready (${sizeMb} MB):`);
  console.log(`  ${apk}\n`);
  log('To put it on your phone:');
  console.log('  adb install -r "' + apk + '"');
  console.log('  …or copy the file across and open it (allow unknown sources).\n');
} else {
  die(`Expected an APK at ${apk} but it is not there.`);
}
