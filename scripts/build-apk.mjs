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
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const IS_WINDOWS = platform() === 'win32';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug');
const allAbis = args.includes('--all');

const log = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const warn = (m) => console.log(`[33m![0m ${m}`);
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

/*
 * ------------------------------------------------------------------ the JDK
 *
 * Android Studio ships a JBR that is routinely newer than anything the Android
 * Gradle Plugin supports, and on a machine with Studio installed JAVA_HOME
 * usually points straight at it. Building on JDK 25 fails every
 * `configureCMake*` task at once with
 *
 *     Execution failed for task ':expo-updates:configureCMakeRelWithDebInfo'
 *     > WARNING: A restricted method in java.lang.System has been called
 *
 * which names a *warning* as the cause and mentions neither Java nor a
 * version. What happens is that AGP forks a JVM for Prefab, JDK 25 prints its
 * restricted-native-access warning on that process's stderr, and AGP reads
 * stderr as the failure. Nothing in the message points at the fix.
 *
 * So the JDK is resolved rather than inherited. Expo SDK 57 builds on 17; 21
 * is the other LTS that AGP accepts. Gradle's own toolchain downloads under
 * ~/.gradle/jdks are searched second, because a build that once needed a Java
 * 17 toolchain has already put one there - which was true on this machine.
 */
const JDK_MIN = 17;
const JDK_MAX = 21;

/** Major version from a JDK's `release` file - cheaper than spawning java. */
function javaMajorOf(home) {
  try {
    const m = /^JAVA_VERSION="(\d+)/m.exec(
      readFileSync(join(home, 'release'), 'utf8'),
    );
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const supported = (v) => v !== null && v >= JDK_MIN && v <= JDK_MAX;

function resolveJdk() {
  if (supported(javaMajorOf(process.env.JAVA_HOME ?? ''))) {
    return process.env.JAVA_HOME;
  }

  const jdks = join(homedir(), '.gradle', 'jdks');
  if (!existsSync(jdks)) return null;

  for (const entry of readdirSync(jdks)) {
    const home = join(jdks, entry);
    if (supported(javaMajorOf(home))) return home;
    // Some archives unpack with the version as a wrapper directory, so look
    // one level down before giving up on this entry.
    if (!existsSync(join(home, 'release'))) {
      let nested = [];
      try {
        nested = readdirSync(home);
      } catch {
        continue; // a file, not a directory
      }
      for (const dir of nested) {
        const candidate = join(home, dir);
        if (supported(javaMajorOf(candidate))) return candidate;
      }
    }
  }
  return null;
}

const JDK = resolveJdk();
if (!JDK) {
  const found = process.env.JAVA_HOME
    ? `JAVA_HOME is Java ${javaMajorOf(process.env.JAVA_HOME) ?? '?'}`
    : 'JAVA_HOME is not set';
  warn(
    `No Java ${JDK_MIN}-${JDK_MAX} JDK found (${found}). Building anyway - if `
      + 'every configureCMake task fails with "a restricted method in '
      + 'java.lang.System has been called", this is why.',
  );
}

const abis = allAbis ? 'arm64-v8a,armeabi-v7a,x86,x86_64' : 'arm64-v8a';
const variant = isDebug ? 'Debug' : 'Release';
const gradlew = join(ROOT, 'android', IS_WINDOWS ? 'gradlew.bat' : 'gradlew');

/*
 * Metaspace, not heap, is what this build runs out of.
 *
 * The generated `android/gradle.properties` ships Expo's default
 * `-Xmx2048m -XX:MaxMetaspaceSize=512m`, and 512m is not enough to hold the
 * Kotlin compiler plus KSP plus AGP's release-only lint across ~40 autolinked
 * modules. It dies 25 minutes in, after the native build has finished, with
 *
 *     e: [ksp] java.lang.OutOfMemoryError: Metaspace
 *
 * Raised here rather than in `gradle.properties` on purpose: that file is
 * regenerated by `expo prebuild`, so a fix written into it lasts exactly until
 * the next prebuild and then this build fails again 25 minutes deep. A command
 * line system property outranks the file and lives in the repo.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';

/*
 * ------------------------------------------- Windows MAX_PATH, checked early
 *
 * Ninja refuses any path over 260 characters unless long paths are enabled
 * machine-wide, and this app's native build generates paths far past that:
 *
 *     ninja: error: Stat(rngesturehandler_codegen_autolinked_build/CMakeFiles/
 *     react_codegen_rngesturehandler_codegen.dir/C_/<your-path>/
 *     Eventerz_dApp/node_modules/react-native-gesture-handler/shared/
 *     shadowNodes/.../RNGestureHandlerDetectorShadowNode.cpp.o):
 *     Filename longer than 260 characters
 *
 * That one is ~365 characters, and it is not fixable by moving the repo: some
 * 250 of them are the `.dir` name plus the absolute source path CMake mirrors
 * into it, so even from `C:\E\` the same path still lands near 305.
 *
 * `CMAKE_OBJECT_PATH_MAX` is not the way out either, and that is worth writing
 * down because it looks exactly like it should be. CMake accepts it and warns
 * accurately - "cannot be safely placed under this directory" - but only the
 * Makefile generators go on to shorten the name. AGP builds with `-GNinja`,
 * which warns and then emits the long path regardless.
 *
 * So the requirement is checked rather than worked around. Failing here costs
 * a second; the ninja error arrives five minutes in, names one .cpp file, and
 * says nothing about the registry.
 */
if (IS_WINDOWS) {
  const query = spawnSync(
    'reg',
    [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
      '/v',
      'LongPathsEnabled',
    ],
    { encoding: 'utf8', shell: true },
  );

  /*
   * Missing, unreadable and 0 all mean the same thing to ninja, but only a
   * successful read proves anything either way. A `reg query` that fails for
   * its own reasons should not block a build, so this refuses on exactly one
   * case: the key was read, and what came back was not a non-zero DWORD.
   */
  const enabled = /LongPathsEnabled\s+REG_DWORD\s+0x0*[1-9a-f]/i.test(
    query.stdout ?? '',
  );

  if (query.status === 0 && !enabled) {
    die(
      [
        'Windows long paths are disabled, and this build cannot finish without',
        'them - ninja rejects the ~365-character object paths that React',
        'Native codegen produces. Enable them once, in an ELEVATED PowerShell:',
        '',
        '  Set-ItemProperty -Type DWord -Value 1 -Name LongPathsEnabled \\',
        '    -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem"',
        '',
        'Then reopen the terminal and run this again. Moving the repo somewhere',
        'shorter does not help: the path is long because of node_modules, not',
        'because of where the project lives.',
      ].join('\n'),
    );
  }
}

const gradleArgs = [
  `:app:assemble${variant}`,
  `-PreactNativeArchitectures=${abis}`,
  // Quoted on Windows because `shell: true` re-parses the command, and the
  // space inside the value would otherwise split it into two arguments.
  `-Dorg.gradle.jvmargs=${IS_WINDOWS ? `"${JVM_ARGS}"` : JVM_ARGS}`,
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
  env: {
    ...process.env,
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    // `?? process.env.JAVA_HOME` so an unresolvable JDK leaves the environment
    // exactly as it was - the warning above already said what that costs.
    JAVA_HOME: JDK ?? process.env.JAVA_HOME,
  },
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
