#!/usr/bin/env node
/**
 * Build a standalone APK you can install on a real phone.
 *
 *   npm run apk            -> release APK, arm64, DEBUG-SIGNED (sideloading)
 *   npm run apk -- --debug -> debug APK that still needs Metro
 *   npm run apk -- --all   -> all ABIs (slower; only needed for wide release)
 *
 * Why this is separate from `npm run android`:
 *
 * A *debug* build loads its JavaScript from Metro at runtime, so the phone has
 * to be on your network with the dev server up. A *release* build bundles the
 * JS into the APK - it runs standalone, which is what you need for real
 * device testing away from your machine.
 *
 * # This output is NOT the one you submit
 *
 * The release buildType signs with the **debug keystore**
 * (android/app/build.gradle), so the APK installs on any phone and is fine for
 * testing and sideloading. It is not acceptable to the Solana dApp Store, and
 * it never will be: the debug keystore is a well-known key that ships with the
 * Android SDK, identical on every machine, so an APK signed with it can be
 * impersonated by anyone.
 *
 * Worse, the signing key is a **permanent identity**. Whatever key first
 * publishes `xyz.eventerz.app` is the only key that can ever update it -
 * publishing with the debug key would mean either never updating the app or
 * abandoning the package name.
 *
 * So submission builds come from EAS, which holds a real upload key:
 *
 *   npm run eas:creds        # one-time, generates and stores the keystore
 *   npm run eas:apk:prod     # the artifact you actually submit
 *
 * See README.md -> "Building an APK" for the full sequence and for how to back
 * the key up.
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

log(`Building ${variant.toLowerCase()} APK for ${abis}...`);
if (!isDebug) {
  log('Release bundles the JS, so the APK runs without Metro.');
  /*
   * Said loudly, and said before the build rather than after it.
   *
   * "Fine for sideloading, not for the store" was already here as a one-liner
   * and was easy to scroll past in five minutes of Gradle output. The mistake
   * it guards against is not recoverable: whatever key first publishes
   * xyz.eventerz.app is the only key that can ever update it.
   */
  log('');
  log('  !!  DEBUG-SIGNED. Do NOT submit this artifact.');
  log('      The debug keystore ships with the Android SDK and is identical on');
  log('      every machine, so anyone can forge an update to it. Submission');
  log('      builds come from EAS:  npm run eas:creds  then  npm run eas:apk:prod');
  log('');
}

/*
 * `shell: true` on Windows is required, not cosmetic: since Node 20.12 the
 * runtime refuses to spawn `.bat`/`.cmd` directly (CVE-2024-27980) and fails
 * with EINVAL *and no output at all*. Gradle never starts, yet what you see is
 * "Build failed - see the output above" above an empty scroll-back, which
 * reads exactly like a compile error you somehow missed. run-android.mjs has
 * carried this for a while; this script was left behind and `npm run apk` had
 * been dead on any current Node since.
 *
 * With `shell: true` the command is re-parsed by cmd.exe, so the path needs
 * quoting - this repo lives under "Eventerz dApp", and the space would
 * otherwise split it into two arguments.
 */
const quote = (p) => (IS_WINDOWS ? `"${p}"` : p);

const result = spawnSync(quote(gradlew), gradleArgs, {
  cwd: join(ROOT, 'android'),
  stdio: 'inherit',
  shell: IS_WINDOWS,
  env: { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK },
});

// Reported separately from a non-zero exit: a spawn failure has produced no
// build output to point at, so "see the output above" would be a dead end.
if (result.error) die(`Could not run Gradle: ${result.error.message}`);
if (result.status !== 0) die('Build failed - see the output above.');

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
  console.log('  ...or copy the file across and open it (allow unknown sources).\n');
} else {
  die(`Expected an APK at ${apk} but it is not there.`);
}
