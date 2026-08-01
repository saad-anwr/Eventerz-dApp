#!/usr/bin/env node
/**
 * Fail an EAS build that has no backend configured.
 *
 * Wired to the `eas-build-pre-install` hook, so it runs on the EAS worker
 * before `npm install` - which is why it uses nothing but Node builtins.
 *
 * # The failure this exists to prevent
 *
 * `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, and they
 * come from `.env`. That file is gitignored, and EAS uploads the project
 * honouring gitignore - so unless the variables are registered with EAS, the
 * worker builds with none of them.
 *
 * Nothing errors. `isSupabaseConfigured` is simply false, `getSupabaseClient()`
 * returns null, and you get a signed, installable APK in which every screen
 * fails to load data. The build is green, the artifact is broken, and the cause
 * is invisible from the build log. That is a far worse outcome than a failed
 * build, so this turns it into one.
 *
 * Local `expo run:android` is unaffected: it reads `.env` off the disk, which is
 * exactly why the problem only ever shows up on EAS.
 */

const REQUIRED = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'the Supabase project URL'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'the Supabase anon key'],
];

/**
 * Profiles that must have a working backend.
 *
 * A profile not listed here is allowed through with a warning - someone
 * deliberately building a demo artifact should not be blocked by a check that
 * cannot know their intent.
 */
const STRICT_PROFILES = new Set(['preview', 'production', 'play']);

const profile = process.env.EAS_BUILD_PROFILE ?? '(none)';
const onEas = process.env.EAS_BUILD === 'true';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!onEas) {
  // Runs locally too, via `npm run build:check`. Nothing to enforce there:
  // a local build reads .env directly.
  console.log(dim('Not an EAS build - skipping the environment check.'));
  process.exit(0);
}

const missing = REQUIRED.filter(([name]) => !process.env[name]);

if (missing.length === 0) {
  console.log(green(`Environment looks complete for profile "${profile}".`));
  process.exit(0);
}

const strict = STRICT_PROFILES.has(profile);
const heading = strict
  ? red(`\nMissing build environment for profile "${profile}".`)
  : yellow(`\nMissing build environment for profile "${profile}".`);

console.error(heading);
for (const [name, what] of missing) {
  console.error(`  - ${name}  ${dim(`(${what})`)}`);
}

console.error(
  [
    '',
    'These are inlined into the bundle at build time. Without them the app',
    'builds successfully and then cannot reach its backend at all.',
    '',
    'They come from EAS environment variables, resolved by the "environment"',
    'field on this build profile in eas.json. Nothing that carries a key is',
    'committed, so an empty environment is the usual cause:',
    '',
    `  eas env:list --environment ${profile}`,
    '',
    'Set whatever is missing, then rebuild:',
    '',
    '  eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "<url>"  \\',
    `    --environment ${profile} --visibility plaintext`,
    '  eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<key>"  \\',
    `    --environment ${profile} --visibility plaintext`,
    '  eas env:create --name EXPO_PUBLIC_HELIUS_RPC_URL    --value "<url>"  \\',
    `    --environment ${profile} --visibility sensitive`,
    '',
    dim('The Supabase URL and anon key are public by design: they ship inside'),
    dim('the APK either way, and RLS is what protects the data.'),
    dim('The service-role key is NOT one of these and must never be set here.'),
    '',
  ].join('\n'),
);

if (strict) {
  console.error(red('Refusing to build an artifact that cannot work.\n'));
  process.exit(1);
}

console.error(yellow('Continuing anyway - this profile is not marked strict.\n'));
