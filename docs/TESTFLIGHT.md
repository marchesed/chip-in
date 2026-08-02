# Shipping a beta to TestFlight

Prereqs: Apple Developer Program membership (have it), `eas-cli` installed, `eas login` done.

Config already in place:
- `app.json` → `ios.bundleIdentifier: com.dmarchese.chipin`, display name **ChipIn**
- `app.json` → `ITSAppUsesNonExemptEncryption: false` (skips the export-compliance
  question on every upload — correct for us, we only talk HTTPS)
- `eas.json` → `production` profile with the Supabase env baked in
- `eas.json` → `appVersionSource: "remote"` + `autoIncrement`, so EAS assigns a
  fresh build number each upload (duplicate build numbers are rejected by Apple)

## 1. Build for the store

```bash
eas build --profile production --platform ios
```

This differs from the dev build: no `expo-dev-client`, signed for **distribution**
rather than internal devices. EAS will prompt for Apple credentials and create the
distribution certificate + provisioning profile. Takes roughly 10–20 minutes.

## 2. Upload to App Store Connect

```bash
eas submit --profile production --platform ios --latest
```

If no App Store Connect app record exists yet, EAS offers to create one — accept.
After upload, Apple processes the build for ~5–15 minutes before it appears in
TestFlight.

## 3. TestFlight setup (App Store Connect, in the browser)

1. **App Store Connect → your app → TestFlight** — wait for the build to finish
   processing.
2. **App Privacy** (App Store Connect → App Information) must be filled in before
   distributing. ChipIn collects: email address, name, and user content
   (expense descriptions/amounts), all linked to the user's identity.
3. **Internal testers** (up to 100 people on your team): add them and they get the
   build immediately — **no Apple review required**. This is the fast path.
4. **External testers** (up to 10,000): requires **Beta App Review** (usually
   ~24h) and a **privacy policy URL**. Only needed if testing beyond your team.

## Shipping updates

- **JS-only changes**: rebuild + resubmit (steps 1–2). Or set up EAS Update to push
  JS over-the-air without a new build.
- **Native changes** (new native module, `app.json` plugin/scheme change): always
  needs a fresh build.
- Bump `version` in `app.json` for a new user-facing version; the build number
  auto-increments on its own.

## Before inviting real testers

- **Re-enable "Confirm email"** in Supabase (Auth → Providers → Email). It was
  turned off for the dev loop, which means anyone can currently register with an
  address they don't own.
- **Delete the smoke-test users** (Auth → Users: `chipin-smoke-*`, `chipin-m3-*`,
  `chipin-m4-*`, `chipin-m5-*`, `chipin-m6-*`). Deleting a user cascades to their
  groups, expenses, and settlements.
- The app icon is still the Expo template icon — fine for a beta, replace before
  a public release.
