# iOS development build (EAS)

You're on Windows testing on an iPhone, so the iOS build runs in **EAS cloud** (no
local Xcode). Requires a free Expo account and your Apple Developer Program
membership (already have it).

The project is pre-configured: `expo-dev-client` is installed and `eas.json` has a
`development` profile with the Supabase env baked in (the `.env` is gitignored and
would otherwise be missing from the cloud build).

## One-time setup

```bash
npm install -g eas-cli
eas login                      # your Expo account
```

## Build + install

```bash
# 1. Register your iPhone (adds its UDID to the provisioning profile).
#    Open the link it prints ON your phone and install the profile.
eas device:create

# 2. Cloud build. EAS will prompt to sign in to Apple and will create/manage
#    the signing certificate + provisioning profile for you.
eas build --profile development --platform ios

# 3. When it finishes, EAS shows a QR code / URL. Open it ON your iPhone to
#    install the ChipIn dev build. (You may need to trust the developer under
#    Settings > General > VPN & Device Management on first launch.)
```

## Run it

```bash
npx expo start --dev-client
```

Open the installed **ChipIn** app (not Expo Go) and scan the QR, or it will list
your running dev server. The app loads its JS from Metro, so normal
edit-and-reload works.

## Why a dev build (vs. Expo Go)

- SDK 57 App Store Expo Go isn't out yet — a dev build sidesteps that entirely.
- **Deep links actually work here.** `chipin://join/{token}` opens the app to the
  join flow in a dev build; Expo Go intercepts custom-scheme links, so the
  invite → join round-trip can only be verified in the dev build.

## Rebuild when native changes

You only need a new `eas build` when **native** deps or config change (new native
module, `app.json` scheme/plugins, etc.). Pure JS/TS changes just reload over
Metro — no rebuild.

## Notes

- The anon key in `eas.json` is the public/publishable key (RLS-protected), so it's
  safe to commit. Rotate to EAS environment variables if you prefer.
- To test in the iOS Simulator instead (needs a Mac), set
  `build.development.ios.simulator` to `true` and rebuild.
- Android dev build (cheaper, no Apple fee) if you ever want it:
  `eas build --profile development --platform android` → installable `.apk`.
