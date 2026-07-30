#!/usr/bin/env node
/**
 * One-command Android launch. No Android Studio required.
 *
 *   npm run android              → first available AVD (or an attached phone)
 *   npm run android -- Seeker    → a specific AVD by name
 *   npm run android -- --device  → an attached physical device over USB
 *
 * This exists because the manual path has four independent ways to fail, and
 * each produces an error that does not name the real cause:
 *
 *   1. ANDROID_HOME unset        → "Failed to resolve the Android SDK path"
 *   2. no device booted          → the build succeeds, then nothing installs
 *   3. wrong ABI compiled        → INSTALL_FAILED_NO_MATCHING_ABIS
 *   4. Metro unreachable         → the app opens to a red screen
 *
 * The script resolves the SDK, boots a device, reads that device's *actual*
 * ABI, builds only that ABI, installs, wires Metro's port, and launches.
 *
 * Building one ABI instead of four takes a clean debug build from ~60 minutes
 * to a few minutes.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const IS_WINDOWS = platform() === 'win32';
const PACKAGE_ID = 'xyz.eventerz.app';
const METRO_PORT = 8081;

const args = process.argv.slice(2);
const wantsPhysical = args.includes('--device');
const wantsWipe = args.includes('--wipe');
const avdArg = args.find((a) => !a.startsWith('--'));

/* ------------------------------------------------------------------ helpers */

const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

/**
 * Spawn a command, inheriting the terminal.
 *
 * `shell: true` on Windows is required, not cosmetic: since Node 20.12 the
 * runtime refuses to spawn `.bat`/`.cmd` directly (CVE-2024-27980) and fails
 * with EINVAL *and no output*, which looks exactly like a silent build failure.
 * gradlew.bat and npx.cmd both hit this.
 */
function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: IS_WINDOWS,
    ...opts,
  });
  if (result.error) {
    die(`Could not run ${cmd}: ${result.error.message}`);
  }
  return result.status ?? 1;
}

function trySh(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

/** With `shell: true` the command string is re-parsed, so paths need quoting. */
const quote = (p) => (IS_WINDOWS ? `"${p}"` : p);

/* --------------------------------------------------------------- SDK lookup */

/**
 * Resolve the SDK without relying on the shell being configured. Falls back to
 * `android/local.properties`, which Gradle uses, so the two cannot disagree.
 */
function resolveSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
  ].filter(Boolean);

  const localProps = join(ROOT, 'android', 'local.properties');
  if (existsSync(localProps)) {
    const match = /^sdk\.dir=(.+)$/m.exec(readFileSync(localProps, 'utf8'));
    if (match) candidates.push(match[1].replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }

  candidates.push(
    join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
    join(process.env.HOME ?? '', 'Android', 'Sdk'),
    join(process.env.HOME ?? '', 'Library', 'Android', 'sdk'),
    'C:\\AndroidSDK\\Sdk',
  );

  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'platform-tools'))) return dir;
  }

  die(
    'Could not find the Android SDK.\n' +
      '  Set ANDROID_HOME, or add sdk.dir to android/local.properties.\n' +
      '  Find the path in Android Studio → Settings → Languages & Frameworks → Android SDK.',
  );
}

const SDK = resolveSdk();
const ADB = join(SDK, 'platform-tools', IS_WINDOWS ? 'adb.exe' : 'adb');
const EMULATOR = join(SDK, 'emulator', IS_WINDOWS ? 'emulator.exe' : 'emulator');

/**
 * Gradle needs a JDK. Android Studio bundles one (`jbr`), so prefer that over
 * asking the user to install and configure a separate JDK — and over whatever
 * stale Java might be first on PATH.
 */
function resolveJdk() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }

  const guesses = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio', 'jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    join(process.env.HOME ?? '', '.jdks'),
  ];

  for (const dir of guesses) {
    const bin = join(dir, 'bin', IS_WINDOWS ? 'java.exe' : 'java');
    if (existsSync(bin)) return dir;
  }
  return null;
}

const JDK = resolveJdk();

/** Env for Gradle: SDK always, JDK when we found one. */
function gradleEnv() {
  return {
    ...process.env,
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    ...(JDK ? { JAVA_HOME: JDK } : {}),
  };
}

/* ------------------------------------------------------------------- device */

function attachedDevices() {
  const out = trySh(ADB, ['devices']) ?? '';
  return out
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[1] === 'device')
    .map((parts) => parts[0]);
}

function bootedFully(serial) {
  return trySh(ADB, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) === '1';
}

/**
 * Wait for a device to reach `sys.boot_completed=1`.
 *
 * The timeout is generous because the *first* boot of a freshly downloaded
 * system image can take many minutes — qemu unpacks and initialises the image
 * while adb reports the device as `offline`. Later boots are far quicker.
 */
async function waitForBoot(timeoutMs = 600_000) {
  const started = Date.now();
  let announced = false;
  let lastNote = 0;

  while (Date.now() - started < timeoutMs) {
    const devices = attachedDevices();
    const ready = devices.find(bootedFully);
    if (ready) {
      log(`Booted in ${Math.round((Date.now() - started) / 1000)}s`);
      return ready;
    }

    if (devices.length && !announced) {
      log('Device attached — waiting for Android to finish booting…');
      announced = true;
    }

    // Reassure every 30s; a silent multi-minute wait looks like a hang.
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (elapsed - lastNote >= 30) {
      lastNote = elapsed;
      log(`…still booting (${elapsed}s). First boot of a new image is slow.`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  die(
    [
      'Timed out waiting for the device to boot.',
      '',
      '  If you recently changed the AVD’s system image (x86 → x86_64, say),',
      '  its userdata is now incompatible and the boot hangs `offline` forever',
      '  instead of reporting a mismatch. Reset it once with:',
      '',
      '    npm run android:wipe',
      '',
      '  Otherwise it may still be initialising — check the emulator window.',
    ].join('\n'),
  );
}

async function ensureDevice() {
  const existing = attachedDevices();

  if (wantsPhysical) {
    const phone = existing.find((s) => !s.startsWith('emulator-'));
    if (!phone) {
      die(
        'No physical device found.\n' +
          '  Enable Developer options → USB debugging, connect by cable, and accept\n' +
          "  the 'Allow USB debugging' prompt on the phone.",
      );
    }
    log(`Using device ${phone}`);
    return phone;
  }

  if (existing.length && !avdArg) {
    log(`Using already-running device ${existing[0]}`);
    return bootedFully(existing[0]) ? existing[0] : waitForBoot();
  }

  const avds = (trySh(EMULATOR, ['-list-avds']) ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (avds.length === 0) {
    die(
      'No emulators found. Create one in Android Studio → Device Manager,\n' +
        '  or attach a phone and run: npm run android -- --device',
    );
  }

  const avd = avdArg && avds.includes(avdArg) ? avdArg : avds[0];
  if (avdArg && avd !== avdArg) {
    warn(`AVD "${avdArg}" not found. Available: ${avds.join(', ')}`);
  }

  log(`Booting emulator "${avd}"${wantsWipe ? ' (wiping data)' : ''}…`);

  /*
   * `-wipe-data` resets userdata. Needed after changing an AVD's system image
   * — e.g. swapping x86 for x86_64 — because the old userdata partition is
   * incompatible with the new image and the emulator hangs `offline` forever
   * rather than reporting a mismatch.
   */
  const emulatorArgs = ['-avd', avd, '-no-boot-anim'];
  if (wantsWipe) emulatorArgs.push('-wipe-data', '-no-snapshot-load');

  // Detached: the emulator must outlive this script.
  spawn(EMULATOR, emulatorArgs, { detached: true, stdio: 'ignore' }).unref();

  return waitForBoot();
}

/* ---------------------------------------------------------------- build/run */

/** ABIs React Native can produce, best first. */
const BUILDABLE_ABIS = ['arm64-v8a', 'x86_64', 'armeabi-v7a', 'x86'];

/**
 * Pick the ABI to compile.
 *
 * Uses the device's full `abilist`, not just the primary, and intersects it
 * with what we can build — an x86_64 emulator reports `x86_64,x86`, and a
 * 64-bit ARM phone reports `arm64-v8a,armeabi-v7a`. Taking the best mutual
 * match means the APK always installs, whichever image the AVD was built from.
 *
 * Getting this wrong is the single most common cause of
 * INSTALL_FAILED_NO_MATCHING_ABIS, and that error never names the reason.
 */
function deviceAbi(serial) {
  const getprop = (key) =>
    trySh(ADB, ['-s', serial, 'shell', 'getprop', key]) ?? '';

  const supported = getprop('ro.product.cpu.abilist')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const primary = getprop('ro.product.cpu.abi').trim();
  const candidates = supported.length ? supported : [primary].filter(Boolean);

  const match = BUILDABLE_ABIS.find((abi) => candidates.includes(abi));

  if (!match) {
    warn(
      `Device reports ABIs [${candidates.join(', ') || 'unknown'}], none of which ` +
        'React Native builds. Falling back to arm64-v8a.',
    );
  }
  return match ?? 'arm64-v8a';
}

function build(abi) {
  const gradlew = join(ROOT, 'android', IS_WINDOWS ? 'gradlew.bat' : 'gradlew');
  log(`Building for ${abi} (one ABI — four would take ~10x longer)…`);

  const status = run(
    quote(gradlew),
    [':app:assembleDebug', `-PreactNativeArchitectures=${abi}`, '--console=plain'],
    { cwd: join(ROOT, 'android'), env: gradleEnv() },
  );

  if (status !== 0) die('Gradle build failed — see the output above.');
}

function install(serial) {
  const apk = join(
    ROOT,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'debug',
    'app-debug.apk',
  );
  if (!existsSync(apk)) die(`APK not found at ${apk}`);

  log('Installing…');
  if (run(quote(ADB), ['-s', serial, 'install', '-r', quote(apk)]) !== 0) {
    die('Install failed.');
  }
}

function wireMetro(serial) {
  // Lets the app reach Metro on localhost over USB/emulator, so no IP config.
  trySh(ADB, ['-s', serial, 'reverse', `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`]);
  log(`Metro port ${METRO_PORT} forwarded`);
}

function launch(serial) {
  log('Launching Eventerz…');
  trySh(ADB, [
    '-s',
    serial,
    'shell',
    'monkey',
    '-p',
    PACKAGE_ID,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
}

/* --------------------------------------------------------------------- main */

if (!JDK) {
  die(
    [
      'Could not find a JDK. Gradle needs one.',
      '  Set JAVA_HOME to Android Studio\u2019s bundled JDK, e.g.',
      '  C:\\Program Files\\Android\\Android Studio\\jbr',
    ].join('\n'),
  );
}

log(`SDK: ${SDK}`);
log(`JDK: ${JDK}`);

const serial = await ensureDevice();
const abi = deviceAbi(serial);

log(`Device ${serial} reports ABI: ${abi}`);
build(abi);
install(serial);
wireMetro(serial);
launch(serial);

console.log('');
log('Starting Metro. Press r to reload, j to open the debugger.\n');

// Hand the terminal to Metro so Ctrl-C behaves as expected.
run('npx', ['expo', 'start', '--dev-client'], { cwd: ROOT, env: gradleEnv() });
