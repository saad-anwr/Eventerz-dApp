# Eventerz - Mobile

**Everything is On-chain. Why not your Meetups?**

The native companion to [www.eventerz.xyz](https://www.eventerz.xyz) -
a wallet-native event app for Android (built with the Solana Seeker in mind) and iOS.

Discover events, RSVP on-chain, hold NFT tickets in your wallet, check in with a QR
scan, and build portable reputation across every community you show up for.

---

## Quick start

```bash
npm install
npx expo start
```

Then press `a` for Android, `i` for iOS, or scan the QR code with Expo Go.

> **Keep the project and `node_modules` on the same drive**, and prefer an SSD.
>
> Both halves of that matter, and each was measured on this machine:
>
> - **Speed.** `node_modules` is ~75,000 files, and Metro reads nearly all of
>   them. From a 5400 RPM HDD a cold bundle took **13m 08s**; from an SSD, **1m
>   10s**. Warm app starts land around 18s.
> - **Correctness.** Splitting them across drives - project on `E:`,
>   `node_modules` junctioned to `C:` - makes Expo Router render its stock
>   "Welcome to Expo" screen instead of the app, with no error of any kind.
>   `babel-preset-expo` inlines the router's app root as a path *relative to*
>   `node_modules/expo-router`, and no relative path exists between two Windows
>   drive letters.
>
> `npm run deps:check` verifies this and runs automatically after `npm install`.
> The full explanation lives at the top of [`scripts/check-deps.mjs`](scripts/check-deps.mjs).

### Running on Android

```bash
npm run android
```

That is the whole thing. The script (`scripts/run-android.mjs`) resolves the SDK
and JDK, boots an emulator if none is attached, reads the device's **actual**
CPU ABI, compiles only that ABI, installs, forwards Metro's port and launches.

```bash
npm run android                 # first available AVD, or an attached phone
npm run android -- Seeker       # a specific AVD by name
npm run android:device          # an attached phone over USB
```

It exists because the manual path has four independent failure modes, none of
which name their real cause:

| Symptom | Actual cause |
| --- | --- |
| "Failed to resolve the Android SDK path" | `ANDROID_HOME` not set in *this* shell |
| Build succeeds, nothing installs | No device was booted |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | Compiled ABI ≠ the device's ABI |
| App opens to a red screen | Metro's port was never forwarded |

The ABI one is the sharpest. Emulators are not all x86_64 - the `Seeker` AVD on
this machine is 32-bit **x86**, so an x86_64 build refuses to install. Reading
the ABI off the device removes the guess.

Compiling one ABI instead of four also takes a clean debug build from about
**60 minutes to under 10**.

### Previewing on your own phone

Two ways, depending on whether you want Metro in the loop.

**Live reload over USB** - code changes appear instantly:

```bash
npm run android:device
```

**Standalone APK** - runs with your machine off, and is what you sideload for
pre-submission testing:

```bash
npm run apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

A release APK bundles the JavaScript, so it needs no dev server. It is signed
with the debug keystore, which is fine for sideloading - replace it with your
own upload key before submitting to the Solana dApp Store.

**Over Wi-Fi, no cable:**

```bash
npm run preview     # expo start --dev-client --tunnel
```

Install a debug APK on the phone first (`npm run apk -- --debug`), then scan the
QR. The tunnel means the phone does not need to be on your network.

### The web target

`npx expo start` -> `w` works, but this is a mobile app: on a desktop browser
it renders inside a 430px phone frame (`components/layout/web-frame.tsx`)
rather than stretching across the window. Web is useful for quick layout
checks - Android is the real target.

> **Node 20.19.4+, 22.13+, or 24.3+ is required** (React Native 0.86's engine range).
> Node 23.x is outside that range and will emit `EBADENGINE` warnings.

### Android toolchain

Native builds need three environment variables. If `expo run:android` reports
*"Failed to resolve the Android SDK path"* or *"'adb' is not recognized"*, these
are missing:

| Variable       | Value                                              |
| -------------- | -------------------------------------------------- |
| `ANDROID_HOME` | your SDK path, e.g. `C:\AndroidSDK\Sdk`             |
| `JAVA_HOME`    | Android Studio's bundled JDK, e.g. `C:\Program Files\Android\Android Studio\jbr` |
| `Path`         | add `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` |

Find your SDK path in **Android Studio -> Settings -> Languages & Frameworks ->
Android SDK**. Set them persistently on Windows with:

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME','C:\AndroidSDK\Sdk','User')
```

Gradle also reads `android/local.properties` (`sdk.dir=...`), which is already
set up here and works even without `ANDROID_HOME` - but the Expo CLI needs the
env var to find `adb`. Note `expo prebuild --clean` deletes `local.properties`.

With `.env` configured the app talks to the real Supabase backend and a real
wallet. Without it, it falls back to seed data and the demo wallet so a fresh
clone still starts - see `.env.example`.

### Scripts

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm run android`       | Boot a device, build its ABI, install, launch, start Metro |
| `npm run android:seeker`| Same, forcing the `Seeker` AVD                             |
| `npm run android:device`| Same, targeting an attached phone over USB                 |
| `npm run apk`           | Standalone release APK (arm64) for sideloading             |
| `npm run preview`       | Metro over a tunnel, for Wi-Fi device testing              |
| `npm start`             | Metro only (a dev build must already be installed)         |
| `npm run typecheck`     | `tsc --noEmit` - strict, currently clean                    |
| `npm run lint`          | ESLint + React Compiler rules - currently clean             |
| `npm run format`        | Prettier over `src/`                                       |
| `npm run prebuild`      | Regenerate `android/` after a native dependency change      |
| `npm run build:check`   | Everything EAS will check, before you spend a build slot   |
| `npm run eas:apk`       | Cloud APK via EAS (`preview` profile)                      |
| `npm run eas:creds`     | Android signing credentials, incl. the keystore SHA-256    |
| `npm run eas:builds`    | The last five Android builds and their status              |

> `eas` is not installed globally here, and every EAS command needs the
> project - so a bare `eas ...`, or any of these run from the repo's parent
> folder, fails with "the term 'eas' is not recognized". Run them from this
> directory, through npm, and both problems go away.

---

## Building an APK

> **⚠ Rotate the Helius API key before launch.** A billable key was previously
> committed here - in `eas.json` and in the tracked `eventerz-arm64-release.apk`.
> Both are cleaned up, but git history still holds the old value, so it has to be
> revoked in the Helius dashboard rather than merely deleted. Steps: root
> `README.md`; rationale: `../Eventerz/docs/SECURITY.md`.


Two ways, and **only one of them can be submitted.** **EAS** builds in the cloud
and needs no Android SDK; **`npm run apk`** builds locally and needs the SDK and
a JDK. The artifact is the same *shape* - a release APK with the JS bundled in,
so it runs without Metro - but not the same signature.

### Signing: which artifact is submittable

| Command | Signed with | Use it for |
| --- | --- | --- |
| `npm run apk` | the **debug keystore** | sideloading, device testing |
| `npm run eas:apk:prod` | the **EAS upload keystore** | **dApp Store submission** |

`npm run apk` produces a debug-signed APK because the release buildType falls
back to the debug keystore when no upload key is configured. That key ships with
the Android SDK and is byte-identical on every machine on earth, so a signature
made with it proves nothing about who built the artifact - which is why no store
accepts it.

The part that makes this worth getting right the first time: **the signing key
is a permanent identity.** Whatever key first publishes `xyz.eventerz.app` is
the only key that can ever ship an update to it. Publish once with the debug key
and the choice is between never updating the app and abandoning the package
name.

So generate a real upload key, once:

```bash
npm run eas:creds       # Android -> Keystore -> "Set up a new keystore"
```

EAS generates it, stores it against the project, and reuses it for every later
build - so it survives this machine dying, which a local `.jks` does not.
`eas.json` pins `"credentialsSource": "remote"` on the `production` and `play`
profiles, so a submission build **fails loudly** if that keystore is missing
rather than quietly emitting a debug-signed APK that looks identical until a
reviewer rejects it.

Back it up anyway, and store the printed SHA-256 fingerprint somewhere you can
find it:

```bash
npx eas-cli credentials --platform android   # -> "Download keystore"
```

The fingerprint matters beyond signing: `assetlinks.json` on the website pins
it, so Android verifies our deep links. Change the key and that file needs the
new value or `eventerz://` links stop resolving.

> `credentials.json` and `*.jks` / `*.keystore` are gitignored. If `eas
> credentials` ever writes one into the repo, leave it there uncommitted or move
> it out - it is the signing identity in plaintext.

### Before the first EAS build

`android/` is gitignored, so EAS regenerates it from `app.json` with
`expo prebuild`. That is the intended flow - it means the permission and icon
config in `app.json` is the single source of truth - but it also means anything
gitignored never reaches the build.

```bash
npm install -g eas-cli          # or use npx eas-cli everywhere below
npx eas-cli login
npx eas-cli init                # writes extra.eas.projectId into app.json
```

Then populate the build environment, once per account - see below.

### Android permissions, and why the list is this short

The Solana dApp Store rejected a submission under **PER-001 / PER-002**
("permissions need attention", "sensitive permission use needs disclosure") for
requesting `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`. Neither was ever
asked for on purpose: `expo-file-system` and `expo-image-picker` both declare
them in their own manifests, and manifest merging pulls a library's permissions
into the app whether or not the app uses that code path.

The shipped set is now exactly:

| Permission                    | Why                                         |
| ----------------------------- | ------------------------------------------- |
| `CAMERA`                      | Scanning ticket QR codes at check-in        |
| `INTERNET`                    | Supabase + Solana RPC                        |
| `ACCESS_NETWORK_STATE`        | `expo-updates` connectivity checks           |
| `VIBRATE`                     | Haptics                                      |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Generated by androidx; app-internal, signature-level |

`CAMERA` is the only dangerous permission, it is requested in context on the
scan screen rather than at launch, and `app/scan.tsx` explains why before asking.

Everything else is stripped via `android.blockedPermissions` in `app.json`, which
emits `tools:node="remove"` so the merger rejects the library's declaration:

* `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` - the rejection. Nothing in
  `src/` touches external storage; there is not a single `FileSystem.` call.
* `USE_BIOMETRIC` / `USE_FINGERPRINT` - `androidx.biometric`, pulled in by
  `expo-secure-store`. Only reachable through SecureStore's
  `requireAuthentication` option, which this app never sets.
* `BIND_GET_INSTALL_REFERRER_SERVICE` - `com.android.installreferrer`, pulled in
  by `expo-application`. Only reachable through `getInstallReferrerAsync()`,
  which is never called.
* `SYSTEM_ALERT_WINDOW` / `RECORD_AUDIO` - never wanted.

**Two things that must stay true together.** Blocking the storage permissions is
only safe because neither picker call site asks for them first.
`launchImageLibraryAsync` goes through `PickVisualMedia` - the system photo
picker - which needs no permission on any API level. The call sites in
`app/profile/edit.tsx` and `features/create/step-components.tsx` therefore call it
directly. Re-adding a `requestMediaLibraryPermissionsAsync()` gate would resolve
to *denied* on API ≤ 32 with no way for the user to grant it, and silently break
avatar and banner picking on older devices. Do not add one back.

Verify a change to any of this against the merged manifest, not `app.json`.
`app.json` only states the intent; the merger decides, and it is the only thing
that can tell you a library's declaration was actually rejected:

```bash
npx expo prebuild --clean --platform android
cd android && ./gradlew :app:processReleaseManifest
grep uses-permission app/build/intermediates/merged_manifests/release/*/AndroidManifest.xml
grep -A2 EXTERNAL_STORAGE app/build/outputs/logs/manifest-merger-release-report.txt
```

**Then clean up, before the next EAS build.** Both commands above have to be
undone or the next `eas build` fails in the *Configure expo-updates* phase with:

    Runtime version calculated on local machine not equal to runtime version
    calculated during build.

`runtimeVersion.policy` is `fingerprint`, so EAS hashes the project twice - once
locally to stamp the build, once on the worker after install - and refuses to
continue if they disagree. Gradle writes `android/build/` output *inside* the
autolinked native modules in `node_modules`, and `@expo/fingerprint` hashes those
package directories whole (`rncoreAutolinkingAndroid`). One stray build directory
under `@react-native-masked-view/masked-view` is enough to change the hash and
burn a build. `android/` itself is harmless - it is gitignored, so it hashes to
nothing - but `node_modules` is not:

```bash
rm -rf android
npm ci                                              # pristine, matches the worker
npx expo-updates fingerprint:generate --platform android
```

If a build has already failed this way, the log names the exact differing source
and both hashes - fetch it with the `logFiles` URL from
`eas build:view <id> --json`. Note the log is brotli-encoded, so PowerShell and
the bundled `curl.exe` cannot read it; Node's `zlib.brotliDecompressSync` can.
Comparing that hash against a local
`npx expo-updates fingerprint:generate --platform android` confirms the fix
*before* you spend another 45 minutes on a build.

### Where the environment comes from

`EXPO_PUBLIC_*` values are inlined into the bundle at build time, and locally
they come from `.env` - which is gitignored, so EAS never sees it. Left alone,
that produces an APK that installs, opens, and cannot reach its backend: a green
build and a dead artifact.

Two mechanisms fill the gap, split by whether the value is a credential.

**Non-secret build behaviour** lives in a `base` profile that every other
profile extends:

```jsonc
"build": {
  "base": {
    "env": {
      "EXPO_PUBLIC_SOLANA_NETWORK": "mainnet-beta",
      "EXPO_PUBLIC_USE_MOCK_WALLET": "false",
      "EXPO_PUBLIC_USE_MOCK_DATA": "false"
    }
  },
  "preview":    { "extends": "base", "environment": "preview",    ... },
  "production": { "extends": "base", "environment": "production", ... }
}
```

The two mock flags are **pinned here rather than copied from `.env`**. They are
opt-in in code, but a shipped build that read `EXPO_PUBLIC_USE_MOCK_WALLET=true`
from somebody's local file would sign with a fake wallet. Pinning removes the
possibility rather than relying on nobody having set it.

**Everything that carries a key** comes from EAS environment variables instead,
resolved by the `environment` field on each profile. Set them once:

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<ref>.supabase.co" \
  --environment preview --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" \
  --environment preview --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_HELIUS_RPC_URL    --value "https://mainnet.helius-rpc.com/?api-key=..." \
  --environment preview --environment production --visibility sensitive
```

`npx eas-cli env:list --environment production` shows what a build will see.

The Supabase pair is public by design - it ships inside the APK either way,
anyone can extract it from the artifact, and **row-level security is what
protects the data**, not the secrecy of the key (`docs/SECURITY.md` in the
website project spells this out). They live in EAS rather than `eas.json` only
so there is one place to change them, not because they need hiding.

The Helius URL is different in kind: it embeds a **billable** API key.

`scripts/check-build-env.mjs` runs as `eas-build-pre-install` and fails the build
if the backend values are missing - which is now the guard that catches an
environment you forgot to populate, before it becomes a dead artifact.

### What must NOT go in eas.json

`eas.json` is committed, so treat it as public. Anything below belongs in an EAS
environment variable or an Edge Function secret:

- **`SUPABASE_SERVICE_ROLE_KEY`** - bypasses RLS entirely. It is an Edge Function
  secret and has no business in a mobile build at all.
- **`EXPO_PUBLIC_HELIUS_RPC_URL`** - the URL embeds a billable API key.

> `--visibility sensitive` keeps a value out of build logs and the dashboard
> list. It does **not** keep it out of the app. Any `EXPO_PUBLIC_` variable is
> compiled into the JS bundle, so `unzip -p app.apk | grep api-key` recovers it
> from any published build. The protection for a client-side RPC key is a spend
> cap and a domain/bundle restriction in the Helius dashboard, not secrecy.

### Commit first - EAS builds from git

EAS uploads the project by archiving what git tracks. An untracked file simply
does not exist on the build worker, and the failure is rarely obvious: the
`eas-build-pre-install` hook in `package.json` runs
`node scripts/check-build-env.mjs`, so if that script is uncommitted the build
dies with `MODULE_NOT_FOUND` before it compiles a line.

```bash
git status            # nothing untracked that the build needs
git add -A && git commit -m "..."
```

Uncommitted *edits* to tracked files are also invisible to EAS. If a fix seems
not to have taken effect in a build, this is almost always why.

### Build

```bash
npm run build:check             # doctor + typecheck + lint + tests, locally
npm run eas:apk                 # preview profile -> installable APK
```

EAS prints a URL when it finishes; open it on the phone, or
`npx eas-cli build:run --platform android` to install the last build onto a
connected device.

| Profile | Output | For |
| --- | --- | --- |
| `preview` | APK, internal | Sideloading and device testing. **This is the one you want.** |
| `production` | APK, internal | Solana dApp Store submission |
| `play` | AAB, store | Google Play only - Play will not take an APK |

There is deliberately no `development` profile: that requires
`expo-dev-client`, which is not a dependency here. `npm run android` already
covers the local dev-build workflow.

### Local alternatives

```bash
npm run apk                     # release APK, arm64, via the local SDK
npm run eas:apk:local           # EAS profile, built on this machine
```

`npm run apk` signs with the debug keystore - fine for sideloading, not for a
store listing. EAS generates and keeps its own upload keystore, which is why the
cloud build needs no signing setup from you.

### Versioning

`eas.json` sets `appVersionSource: "remote"` with
`autoIncrement: "versionCode"`, so EAS owns the version code and bumps it every
build. `app.json` carries the human-facing `version` ("1.0.0"); raise that by
hand when you want the displayed version to change.

### App Links, and the one thing that silently breaks them

`app.json` claims `https://eventerz.xyz/checkin` with `autoVerify: true`, so a
scanned check-in link opens the app instead of the browser. Android only
honours that if the site serves a Digital Asset Links file naming **the
SHA-256 of the certificate this build is signed with**.

That is one fact stored in two places - the EAS keystore and the website - and
nothing warns you when they stop agreeing. Rotating the keystore is exactly
what breaks it, and the failure is quiet: links keep working, they just open
in the browser. Check both sides after any credentials change:

```bash
npm run eas:creds                                        # keystore SHA-256
curl -s https://www.eventerz.xyz/.well-known/assetlinks.json
```

The fingerprints must be identical. The website builds that file from
`ANDROID_CERT_SHA256`, so a mismatch is fixed there, not here.

Nothing is lost while they disagree - `/checkin` still opens in a browser, and
the in-app scanner never depended on this at all.

---

## Design system

Ported from the web app so the two products read as one. Nothing here was
invented from scratch - the tokens carry the same values, resolved per-platform.

| Web (`tailwind.config.ts`)             | Mobile                                              |
| -------------------------------------- | --------------------------------------------------- |
| `brand.*` palette                      | `src/theme/colors.ts` - identical hex values         |
| HSL vars in `globals.css`              | `surface.*` in `src/theme/colors.ts`                 |
| `bg-brand-gradient` (135°)             | `gradients.brand` -> `<LinearGradient>` 0,0 -> 1,1     |
| `.glass` / `.gradient-border`          | `<GlassCard>` (expo-blur + hairline + gradient rim)  |
| Inter / Space Grotesk / JetBrains Mono | Same three families via `@expo-google-fonts`         |
| `components/ui/button.tsx`             | `src/components/ui/button.tsx` - same five variants  |
| `components/ui/badge.tsx`              | `src/components/ui/badge.tsx` - same variants        |
| `components/app/event-card.tsx`        | `src/components/cards/event-card.tsx`                |
| `components/ui/logo.tsx`               | `src/components/brand/logo.tsx` - same SVG paths     |
| `lib/format.ts`, `lib/avatar.ts`       | `src/utils/format.ts`, `src/utils/avatar.ts`         |
| Framer Motion                          | Reanimated 4 (UI-thread worklets)                    |

App icons are generated from the same vector definition as `<EventerzMark>`, so
the launcher icon and the in-app logo are the same artwork.

### Styling

NativeWind 4 with Tailwind 3.4.17 - the same major version the web app uses, so
class names mean the same thing on both platforms. Where React Native has no CSS
equivalent, the design system supplies a component instead:

- gradients -> `expo-linear-gradient`
- `backdrop-blur` -> `<GlassCard>` / `expo-blur`
- gradient text -> `<GradientText>` (SVG)
- radial blobs -> `<AuroraBackground>`

---

## Architecture

```
src/
├── app/               # expo-router routes (file-based)
│   ├── _layout.tsx    #   providers, fonts, splash gate
│   ├── index.tsx      #   animated splash -> onboarding or tabs
│   ├── onboarding.tsx
│   ├── (tabs)/        #   Home · Discover · Create · Tickets · Profile
│   ├── event/[id]     #   detail screens
│   ├── ticket/[id]
│   ├── community/[id]
│   ├── user/[id]
│   ├── profile/edit
│   └── scan · dashboard · notifications · settings
├── components/
│   ├── ui/            # primitives (button, card, sheet, chip, states...)
│   ├── brand/         # logo, aurora background, particles
│   ├── cards/         # event, featured, NFT ticket, community, stats, profile
│   └── layout/        # animated header, section header
├── features/          # screen-scoped composites (wallet, home, discover, ...)
├── navigation/        # custom tab bar
├── hooks/             # React Query hooks + UI hooks
├── repositories/      # data access - the API swap point
├── services/          # wallet adapter, Solana, analytics, push, HTTP
├── store/             # Zustand (wallet, preferences, discover, draft, toast)
├── theme/             # colours, typography, spacing, motion
├── types/             # domain models
├── utils/             # format, avatar, storage, haptics
└── mock/              # seed data (in-memory DB)
```

**Data flow:** screens -> hooks (React Query) -> repositories -> mock DB.
Screens never touch mock data directly, so pointing the repositories at a real
API changes one layer and nothing else.

**State split:** React Query owns server state (events, tickets, users).
Zustand owns client state (wallet session, preferences, filters, draft, toasts).

The tree is organised so `components/`, `theme/`, `types/` and `utils/` can move
into a shared package in a monorepo without touching imports - none of them
depend on `app/` or `features/`.

---

## Wallet integration

The app uses **Solana Mobile Wallet Adapter** - real Phantom / Solflare /
Backpack / Seeker wallets. The seam is `WalletAdapter` in `src/types/wallet.ts`:

| File                                       | Used when                          |
| ------------------------------------------ | ---------------------------------- |
| `services/wallet/mobile-wallet-adapter.ts` | Android dev/release build (default) |
| `services/wallet/mock-wallet-adapter.ts`   | Expo Go, iOS, or `EXPO_PUBLIC_USE_MOCK_WALLET=true` |

MWA is Android-only and needs native code, so `wallet-service.ts` falls back to
the mock elsewhere - and Settings says so rather than pretending.

`services/wallet/wallet-service.ts` picks between them from a single flag.
To go live with Solana Mobile Wallet Adapter:

1. `npx expo prebuild --platform android && npx expo run:android` - MWA needs
   native code and does **not** run in Expo Go
2. Install `@solana-mobile/mobile-wallet-adapter-protocol-web3js`,
   `@solana/web3.js`, `react-native-get-random-values`, `buffer`
3. Fill in the method bodies in `mobile-wallet-adapter.ts` - reference
   implementations are in the comments
4. Set `EXPO_PUBLIC_USE_MOCK_WALLET=false`

No screen, hook or store changes.

Wallets offered in the connect sheet: **Solana Wallet (Seeker)**, Phantom,
Solflare, Backpack, Jupiter.

---

## Where each integration lives

Implemented, and where:

| Area                | Where                                                          |
| ------------------- | -------------------------------------------------------------- |
| Wallet              | `services/wallet/mobile-wallet-adapter.ts` (Mobile Wallet Adapter) |
| On-chain actions    | `services/solana/program.ts` -> `services/solana-service.ts`     |
| Token holdings      | `services/solana/holdings.ts` — Helius DAS, with a keyless fallback |
| Supabase            | `services/auth/supabase-client.ts`; data in `repositories/supabase/` |
| Maps                | `utils/maps.ts` + `features/create/location-picker.tsx`          |
| Deep linking        | `scheme: eventerz` in `app.json`                                 |
| QR scanner / camera | `app/scan.tsx` — live via expo-camera                            |

Server-side, because the client is the wrong place for them:

| Area          | Where                                                        |
| ------------- | ------------------------------------------------------------ |
| cNFT minting  | `mint-cnft` Edge Function — a Bubblegum mint is signed by the tree authority, so it cannot run on a device |
| Token gating  | `check-gate` Edge Function — reads the balance from the cluster with a service-role key |

Genuinely not built yet. Each is a no-op that returns nothing rather than a stub
that returns success:

| Area              | Where                                | State                                        |
| ----------------- | ------------------------------------ | -------------------------------------------- |
| Push notifications | `services/notification-service.ts`  | returns `false`/`null`; `expo-notifications` is not installed |
| Analytics          | `services/analytics-service.ts`     | logs in dev, drops otherwise, warns if the flag is on with no provider |
| Biometric login    | `featureFlags.enableBiometricLogin` | flag only                                    |

> Three seams were **removed** rather than left here: `mintTicket`, `claimBadge`,
> `getWalletAssets` and `checkTokenGate`. The first two build intents the wallet
> adapter refuses permanently by design; the third was superseded by
> `holdings.ts`; the fourth returned `true` for every caller, which is a gate
> that opens for everyone while looking like one that does not.

---

## Performance

- Reanimated 4 worklets - animation runs on the UI thread, not JS
- FlatList windowing tuned per screen (`initialNumToRender`, `windowSize`,
  `removeClippedSubviews`)
- `React.memo` on every list row, plus React Compiler enabled
- Blur reserved for iOS; Android uses a translucent fill (BlurView is expensive
  and inconsistent below API 31)
- Fonts imported per-weight - the package roots re-export ~30 unused TTFs
- Debounced search, cursor-paginated feed

## Accessibility

- Every interactive element clears the 44px touch-target floor (`TOUCH_TARGET`)
- Screen-reader labels, roles and states throughout; icon-only buttons require a
  `label` prop at the type level
- Dynamic type honoured up to 1.4x (`maxFontSizeMultiplier`)
- `useReducedMotion()` respects both the OS setting and the in-app toggle -
  decorative animation stops, navigation transitions continue
- Decorative layers (aurora, particles, skeletons) hidden from assistive tech
- Text meets WCAG AA against the dark surfaces

---

## Known limitations

Stated plainly rather than hidden:

- **Dark-first.** The theme picker in Settings saves your choice, but the palette
  renders dark regardless - light mode is not implemented, and the UI says so
  instead of shipping a toggle that does nothing.
- **Date picking** in the Create wizard uses relative presets, not a calendar.
  A native picker needs `@react-native-community/datetimepicker`, which is not
  available in Expo Go.
- **Typed routes** (`experiments.typedRoutes`) are off. The generator did not
  produce route types reliably on SDK 57 here, and a stale types file turns
  every `router.push` into a type error. Re-enable in `app.json` if it works
  for you.
- **On-chain calls are not live.** No Anchor program is deployed, so
  `signAndSendTransaction` refuses rather than fabricating a signature. RSVP,
  ticketing and check-in are real - they run through Postgres - but nothing is
  written to Solana yet. Set `EXPO_PUBLIC_EVENTERZ_PROGRAM_ID` once a program
  exists.
- **Seed data is opt-in.** The app talks to Supabase by default, so a fresh
  project starts empty. Set `EXPO_PUBLIC_USE_MOCK_DATA=true` for offline UI work.
- **Web is a preview target**, not a supported one. It builds and runs, but
  blur falls back to a flat fill, haptics are no-ops, and the camera scanner
  needs the "Simulate a scan" button.

## License

MIT - see [LICENSE](./LICENSE).
