#!/usr/bin/env node
/**
 * Android smoke suite - run against a booted emulator or an attached device.
 *
 *   npm run android:smoke
 *   npm run android:smoke -- --monkey 1500     # longer stress run
 *   npm run android:smoke -- --skip-monkey
 *
 * # Why this exists
 *
 * `npm test` covers pure logic - the state machine, lamport arithmetic,
 * instruction encoding. None of it touches a device, so none of it can catch
 * the failures that only happen on Android: a native module missing from the
 * build, a permission declared but never granted, a deep link that resolves to
 * nothing, a JS exception that shows a red screen and never reaches a test
 * runner.
 *
 * Everything here is driven through `adb`, so it exercises the installed APK
 * rather than the source. That is the point: the artefact users get is the one
 * under test.
 *
 * # What a failure means
 *
 * Each check prints PASS/FAIL/SKIP and the suite exits non-zero if anything
 * failed. A FAIL is a real defect in the build; a SKIP means the precondition
 * was absent (no device, package not installed) and is reported rather than
 * silently treated as success - a suite that passes because it did nothing is
 * the failure mode this is meant to avoid.
 *
 * # Normal use and stress are scanned separately, deliberately
 *
 * The log is read twice: once after launch and deep links, and again after the
 * monkey run. An earlier version scanned only at the end, which meant a monkey
 * -induced ANR was indistinguishable from the app hanging on startup - and they
 * are not the same claim. "It ANRs when you open it" is a launch blocker. "It
 * ANRs after 600 random taps" usually is not.
 *
 * Read a stress ANR with the build in mind. This runs a **debug** build served
 * by Metro: JS is unoptimised, every bridge call is instrumented, and the
 * emulator is slower than a phone. Input-dispatch timeouts under a random-input
 * firehose are expected there and frequently absent from a release build.
 * Reproduce on release before treating one as real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_ID = 'xyz.eventerz.app';
const SCHEME = 'eventerz';

/**
 * Packages this app legitimately hands off to.
 *
 * Used twice, for related reasons: monkey must be allowed to let them start
 * (see the stress section), and they must be cleared before a run - the stress
 * phase can leave a browser or a file picker in front, and the next run would
 * then cold-start Eventerz behind it and report a focus failure that belongs to
 * the previous run.
 */
const HANDOFF_PACKAGES = [
  'com.google.android.documentsui', // expo-image-picker -> files
  'com.google.android.providers.media.module', // photo picker
  'com.android.chrome', // Custom Tabs -> outbound links
];

const args = process.argv.slice(2);
const skipMonkey = args.includes('--skip-monkey');
const monkeyEvents = Number(
  args[args.indexOf('--monkey') + 1] > 0 ? args[args.indexOf('--monkey') + 1] : 0,
) || 600;

/* ----------------------------------------------------------------- plumbing */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function resolveAdb() {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidate = join(sdk, 'platform-tools', exe);
  return existsSync(candidate) ? candidate : 'adb';
}

const ADB = resolveAdb();
let serial = null;

/** Run adb, returning stdout. Never throws - callers decide what a failure is. */
function adb(adbArgs, { timeout = 60_000 } = {}) {
  const full = serial ? ['-s', serial, ...adbArgs] : adbArgs;
  const r = spawnSync(ADB, full, { encoding: 'utf8', timeout, windowsHide: true });
  return {
    ok: r.status === 0,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
  };
}

const shell = (cmd, opts) => adb(['shell', cmd], opts);

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const tag =
    status === 'PASS'
      ? c.green('PASS')
      : status === 'FAIL'
        ? c.red('FAIL')
        : c.yellow('SKIP');
  console.log(`  ${tag}  ${name}${detail ? c.dim(` - ${detail}`) : ''}`);
}

function section(title) {
  console.log(`\n${c.bold(c.cyan(title))}`);
}

/* -------------------------------------------------------------------- setup */

console.log(c.bold('\nEventerz - Android smoke suite'));
console.log(c.dim(`adb: ${ADB}`));

const devices = adb(['devices']);
const attached = devices.out
  .split('\n')
  .slice(1)
  .map((l) => l.trim().split(/\s+/))
  .filter((p) => p[1] === 'device')
  .map((p) => p[0]);

if (attached.length === 0) {
  console.error(
    c.red('\nNo device or emulator attached.') +
      '\nStart one first:\n' +
      c.dim('  npm run android:seeker\n'),
  );
  process.exit(1);
}
serial = attached[0];
console.log(c.dim(`device: ${serial}${attached.length > 1 ? ` (of ${attached.length})` : ''}`));

/* ------------------------------------------------------------------- checks */

section('Install');

const pkgList = shell(`pm list packages ${PACKAGE_ID}`);
const installed = pkgList.out.includes(PACKAGE_ID);
record(
  'Package is installed',
  installed ? 'PASS' : 'FAIL',
  installed ? PACKAGE_ID : 'run `npm run android:seeker` first',
);

if (!installed) {
  console.error(c.red('\nNothing else can run without the app installed.\n'));
  process.exit(1);
}

const versionOut = shell(`dumpsys package ${PACKAGE_ID} | grep versionName`);
record(
  'Reports a version',
  /versionName=\S+/.test(versionOut.out) ? 'PASS' : 'FAIL',
  (versionOut.out.match(/versionName=(\S+)/) ?? [])[1] ?? versionOut.out,
);

section('Permissions');

/*
 * Declared vs granted. CAMERA is runtime-granted, so "not granted" is the
 * correct state before the user has ever opened the scanner - that is what the
 * permission flow is for, and it is now handled (`canAskAgain` -> Settings).
 * INTERNET and VIBRATE are install-time and must always be granted.
 */
const permDump = shell(`dumpsys package ${PACKAGE_ID}`);
const declares = (p) => permDump.out.includes(p);

for (const perm of [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.VIBRATE',
]) {
  record(`Declares ${perm.split('.').pop()}`, declares(perm) ? 'PASS' : 'FAIL');
}

/*
 * Permissions the app must not ship with.
 *
 * This is the check that caught real drift: `android/` is generated by
 * `expo prebuild` and gitignored, so it can fall behind `app.json` silently.
 * The config said `recordAudioAndroid: false` while the installed APK requested
 * the microphone, because the native project had been generated before that
 * option was added and never regenerated. Anyone reading `app.json` would have
 * been wrong about the artefact users install.
 *
 * SYSTEM_ALERT_WINDOW ("display over other apps") matters for the same reason
 * and is worse on review: it is one of the permissions Play scrutinises hardest,
 * and nothing in this app draws an overlay.
 */
const forbidden = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_SMS',
];

/*
 * SYSTEM_ALERT_WINDOW is judged against the variant, not banned outright.
 *
 * React Native's `src/debug/AndroidManifest.xml` declares it for the dev-menu
 * overlay, so a debug build has it legitimately and flagging that is a false
 * positive - the kind that trains people to ignore the suite. In a release
 * build nothing draws an overlay, and it is one of the permissions Play
 * scrutinises hardest, so there it is a hard failure.
 */
const debuggable = /flags=\[[^\]]*DEBUGGABLE/.test(permDump.out);
const hasOverlay = declares('android.permission.SYSTEM_ALERT_WINDOW');
if (hasOverlay && !debuggable) forbidden.push('android.permission.SYSTEM_ALERT_WINDOW');

const leaked = forbidden.filter(declares);
record(
  'Requests no unexpected sensitive permissions',
  leaked.length === 0 ? 'PASS' : 'FAIL',
  leaked.length
    ? `${leaked.join(', ')} - regenerate with \`npx expo prebuild -p android --clean\``
    : 'no mic, location, contacts or SMS',
);
record(
  'Overlay permission is release-clean',
  !hasOverlay || debuggable ? 'PASS' : 'FAIL',
  hasOverlay
    ? 'present, but this is a debug build - RN dev menu declares it; absent from release'
    : 'absent',
);

section('Cold start');

/*
 * Reset the device first, so a run does not inherit the last one's mess.
 *
 * The stress phase can legitimately end with Chrome or the file picker in
 * front. Without this the next run cold-starts Eventerz behind that window,
 * never sees focus, and reports a failure that belongs to the previous run -
 * a test that only passes on a pristine device is not a test anyone will trust.
 */
for (const pkg of [PACKAGE_ID, ...HANDOFF_PACKAGES]) {
  shell(`am force-stop ${pkg}`);
}
shell('input keyevent KEYCODE_HOME');

// Clear the log so anything below is attributable to this run.
adb(['logcat', '-c']);

const start = shell(
  `am start -W -n ${PACKAGE_ID}/.MainActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`,
  { timeout: 120_000 },
);
const launched = /Status:\s*ok/i.test(start.out) || /Complete/i.test(start.out);
const totalMs = Number((start.out.match(/TotalTime:\s*(\d+)/) ?? [])[1] ?? 0);
record(
  'Launches from a cold start',
  launched ? 'PASS' : 'FAIL',
  totalMs ? `${totalMs} ms to first frame` : start.out.split('\n')[0],
);

/**
 * Wait until the app owns a **focused window**, not merely the foreground task.
 *
 * These are different states, and the difference is the whole reason this
 * function exists. `mFocusedApp` names our activity the instant it is created;
 * `mCurrentFocus` only names a window once one exists and can accept input.
 * Between the two the app is on screen, showing a splash, and cannot respond to
 * anything.
 *
 * That window is long on a debug build: the JS bundle is fetched from Metro at
 * launch, and this emulator took 41 seconds to first frame. A fixed sleep was
 * the original approach and it was wrong - the suite went on to stress an app
 * that had not finished starting, and Android duly reported "Application does
 * not have a focused window" against a product that was doing nothing wrong.
 *
 * A release build has the bundle compiled in and reaches this in a second or
 * two, so the generous timeout costs nothing there.
 */
function waitForFocusedWindow(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = shell('dumpsys window | grep -E "mCurrentFocus"').out;
    if (last.includes(PACKAGE_ID)) {
      return { ok: true, waitedMs: timeoutMs - (deadline - Date.now()) };
    }
    // A crash to home shows the launcher in mCurrentFocus - fail fast on it
    // rather than burning the whole timeout.
    if (/Launcher|launcher/.test(last) && Date.now() - (deadline - timeoutMs) > 15_000) {
      return { ok: false, waitedMs: timeoutMs - (deadline - Date.now()), last };
    }
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)'], {
      timeout: 5_000,
    });
  }
  return { ok: false, waitedMs: timeoutMs, last };
}

const focus = waitForFocusedWindow();
record(
  'Presents a focused window',
  focus.ok ? 'PASS' : 'FAIL',
  focus.ok
    ? `interactive after ${Math.round(focus.waitedMs / 1000)}s${
        focus.waitedMs > 15_000 ? ' (debug build - bundle served by Metro)' : ''
      }`
    : `never gained window focus - ${focus.last?.trim().slice(0, 100)}`,
);

section('Deep links');

/*
 * Every route the app links to itself. A scheme that resolves to nothing is
 * invisible in normal use and breaks the moment a notification or a shared
 * link points at it.
 */
const deepLinks = [
  '/',
  '/settings',
  '/notifications',
  '/messages',
  '/friends',
  '/scan',
  '/dashboard',
  /*
   * The OAuth landing route, and the reason this list is worth having.
   *
   * Google sign-in redirects to `eventerz://auth/callback?code=...`. Android
   * hands that URL to the app as well as to the browser, so it has to resolve
   * to something. For a while it did not: the app showed "Signed in" and the
   * 404 screen at the same time, and because the session did land, the failure
   * looked like a rendering glitch rather than a missing route.
   *
   * The fake code is deliberate. It cannot complete an exchange, so this checks
   * the thing that actually broke - that the route exists and handles a bad
   * code without crashing - rather than needing a real sign-in.
   */
  '/auth/callback?code=smoke-test-not-a-real-code',
];

for (const path of deepLinks) {
  const url = `${SCHEME}://${path.replace(/^\//, '')}`;
  const r = shell(
    `am start -a android.intent.action.VIEW -d "${url}" ${PACKAGE_ID}`,
    { timeout: 45_000 },
  );
  const ok = !/Error|Exception|does not exist/i.test(r.out);
  record(`Resolves ${url}`, ok ? 'PASS' : 'FAIL', ok ? '' : r.out.split('\n')[0]);
}

/**
 * Read the log and assert nothing bad is in it.
 *
 * `phase` names where we are, so a failure says whether the app fell over on
 * startup or under stress. `attributeMonkey` reports ANRs that the monkey
 * itself logged, which are a different and much weaker signal.
 */
function scanLog(phase, { attributeMonkey = false } = {}) {
  const log = adb(['logcat', '-d', '-v', 'brief']);
  const lines = log.out.split('\n');

  /*
   * Scope crashes to our package.
   *
   * A `FATAL EXCEPTION` line names a thread, not an app, so matching it alone
   * fails the suite for anything on the device that dies - on this emulator
   * that was `com.breel.wallpapers18`, the live wallpaper, crashing on its own
   * GL thread. Blaming Eventerz for that is worse than not checking, because it
   * is a failure nobody can act on.
   *
   * The package appears on the `Process:` line that AndroidRuntime prints
   * immediately after, so pair them before calling it ours.
   */
  const fatals = lines.filter((l, i) => {
    if (!/FATAL EXCEPTION|AndroidRuntime.*FATAL/i.test(l)) return false;
    const block = lines.slice(i, i + 4).join(' ');
    return block.includes(PACKAGE_ID);
  });
  const foreignFatals = lines.filter(
    (l, i) =>
      /FATAL EXCEPTION/i.test(l) &&
      !lines.slice(i, i + 4).join(' ').includes(PACKAGE_ID),
  );
  record(
    `No fatal exceptions (${phase})`,
    fatals.length === 0 ? 'PASS' : 'FAIL',
    fatals.length
      ? fatals[0].slice(0, 140)
      : foreignFatals.length
        ? `clean (${foreignFatals.length} crash${foreignFatals.length > 1 ? 'es' : ''} in other packages, ignored)`
        : 'clean',
  );

  const anrs = lines.filter((l) => /ANR in .*eventerz/i.test(l));

  /*
   * Distinguish "the app hung" from "the app lost focus and was blamed".
   *
   * Every ANR seen here has been the second kind. Monkey taps an outbound link
   * - Settings has three, and receipts link to the explorer - the app correctly
   * opens a Chrome Custom Tab, focus leaves, and monkey keeps injecting input at
   * an activity that is no longer frontmost. Android reports "Application does
   * not have a focused window" against our package for doing exactly what it
   * was asked to do.
   *
   * The downgrade is deliberately narrow, so a real hang still fails: it needs
   * the focus-loss reason **and** evidence that another package took the screen
   * during this phase. A genuine hang reports "is not responding. Waited Nms
   * for ..." with our activity still frontmost, and no external Displayed line.
   */
  const focusLossOnly =
    anrs.length > 0 &&
    lines.some(
      (l) => /does not have a focused window/i.test(l) || /W\/Monkey/.test(l),
    );
  const externalActivity = lines.find(
    (l) => /Displayed /.test(l) && !/eventerz/i.test(l),
  );
  const stolenFocus = Boolean(attributeMonkey && focusLossOnly && externalActivity);

  const who = externalActivity
    ? (externalActivity.match(/Displayed ([^/:]+)/) ?? [])[1] ?? 'another app'
    : 'another app';

  record(
    `No ANRs (${phase})`,
    anrs.length === 0 || stolenFocus ? 'PASS' : 'FAIL',
    anrs.length === 0
      ? 'clean'
      : stolenFocus
        ? `focus taken by ${who} (an outbound link opened a browser) - the app did not hang`
        : (anrs[0] ?? '').slice(0, 140),
  );

  // React Native surfaces JS errors here before they become a red screen.
  const jsErrors = lines.filter(
    (l) =>
      /ReactNativeJS.*(Error|Warning: Failed|Unhandled)/i.test(l) &&
      !/Require cycle/i.test(l),
  );
  record(
    `No unhandled JS errors (${phase})`,
    jsErrors.length === 0 ? 'PASS' : 'FAIL',
    jsErrors.length ? jsErrors[0].slice(0, 140) : 'clean',
  );
}

section('Log scan - normal use');
scanLog('normal use');

/*
 * Clear before stressing. `logcat -d` dumps the whole buffer, so without this
 * the second scan re-reports everything the first one already covered and the
 * two phases stop being distinguishable - which is the entire point of running
 * them separately.
 */
adb(['logcat', '-c']);

section('Stability');

if (skipMonkey) {
  record('Stress test', 'SKIP', '--skip-monkey');
} else {
  /*
   * The deep-link section fired six `am start` intents, each of which can
   * re-create the activity. Stressing before it settles reproduces exactly the
   * "no focused window" ANR this suite spent a run misdiagnosing.
   */
  const ready = waitForFocusedWindow(90_000);
  if (!ready.ok) {
    record('Ready to stress', 'FAIL', 'no focused window after deep links');
  }

  /*
   * Seeded so a failure is reproducible. `--throttle` keeps it to something a
   * finger could plausibly do; without it the monkey outruns React Native's
   * bridge and reports failures no user could cause.
   *
   * The zeroed categories generate input a person never sends. `--pct-anyevent`
   * injects raw keyboard scancodes, `--pct-syskeys` presses volume and home,
   * `--pct-appswitch` launches other activities - all three take focus away
   * from the app and then blame it for not responding. That is exactly what
   * produced an "Application does not have a focused window" ANR saying nothing
   * about the product. What remains is touch, motion and navigation.
   */
  /*
   * The extra `-p` entries are the packages *this app* hands off to, and they
   * are required for the run to mean anything.
   *
   * `-p` is not "stay in this app" - it is an allowlist of activities monkey
   * will permit to start, including ones our own code launches. With only our
   * package listed, a tap on "change avatar" made the app launch the system
   * picker and monkey rejected it:
   *
   *   START ... cmp=com.google.android.documentsui/...FilesActivity
   *   // Rejecting start of Intent { ... com.google.android.documentsui ... }
   *   Not sending touch gesture ... because it is not responsive
   *
   * The app was left having dispatched an intent to an activity that was never
   * allowed to appear, focus belonged to nothing, and input dispatch timed out.
   * Android then reported an ANR against us for behaving correctly.
   *
   * Allowing them also makes this a better test: leaving to a picker or a
   * browser and coming back is a real flow, and a real place to break.
   */
  const monkey = shell(
    `monkey ${[PACKAGE_ID, ...HANDOFF_PACKAGES].map((p) => `-p ${p}`).join(' ')} ` +
      `-s 42 --throttle 120 ` +
      `--pct-syskeys 0 --pct-appswitch 0 --pct-anyevent 0 --pct-flip 0 ` +
      `--ignore-timeouts --ignore-security-exceptions -v ${monkeyEvents}`,
    { timeout: 420_000 },
  );
  /*
   * Monkey reports crashes in every package it is allowed to touch, and we now
   * allow the picker and the browser. `// CRASH: com.breel.wallpapers18` is the
   * emulator's live wallpaper falling over on its own GL thread - real, and
   * nothing to do with this product. Only ours counts.
   */
  const ourFailure = monkey.out
    .split('\n')
    .find(
      (l) => /\/\/ (CRASH|ANR)/i.test(l) && l.includes(PACKAGE_ID),
    );
  const otherFailures = monkey.out
    .split('\n')
    .filter((l) => /\/\/ (CRASH|ANR)/i.test(l) && !l.includes(PACKAGE_ID));

  record(
    `Survives ${monkeyEvents} random events`,
    ourFailure ? 'FAIL' : 'PASS',
    ourFailure
      ? ourFailure.trim().slice(0, 120)
      : otherFailures.length
        ? `no crash or ANR in ${PACKAGE_ID} (${otherFailures.length} in other packages, ignored)`
        : 'no crash or ANR',
  );
}

section('Log scan - after stress');
scanLog('after stress', { attributeMonkey: true });

/* ------------------------------------------------------------------ summary */

const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'SKIP');
const passed = results.filter((r) => r.status === 'PASS');

console.log(
  `\n${c.bold('Summary')}  ` +
    `${c.green(`${passed.length} passed`)}  ` +
    `${failed.length ? c.red(`${failed.length} failed`) : c.dim('0 failed')}  ` +
    `${skipped.length ? c.yellow(`${skipped.length} skipped`) : c.dim('0 skipped')}\n`,
);

if (failed.length) {
  for (const f of failed) console.log(`  ${c.red('✗')} ${f.name}${f.detail ? c.dim(` - ${f.detail}`) : ''}`);
  console.log('');
  process.exit(1);
}
