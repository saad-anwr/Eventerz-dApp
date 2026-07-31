# Eventerz - Mobile

**Everything is On-chain. Why not your events?**

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

## Future integration points

Each is a stub with a documented TODO, already wired into the UI:

| Area                | Where                                                |
| ------------------- | ---------------------------------------------------- |
| Anchor program      | `services/solana-service.ts`                         |
| Metaplex / cNFTs    | `services/solana-service.ts` -> `mintTicket`          |
| Helius DAS          | `services/solana-service.ts` -> `getWalletAssets`     |
| Token gating        | `services/solana-service.ts` -> `checkTokenGate`      |
| REST backend        | `services/api-client.ts` (typed, auth, timeout)      |
| Supabase            | `constants/config.ts` env keys                       |
| Push notifications  | `services/notification-service.ts`                   |
| Analytics           | `services/analytics-service.ts`                      |
| Biometric login     | `featureFlags.enableBiometricLogin`                  |
| Deep linking        | `scheme: eventerz` in `app.json`                     |
| QR scanner / camera | `app/scan.tsx` - live via expo-camera                |
| Maps                | `features/create/step-components.tsx` (venue picker) |

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
