# Auth + deep links

Two deep links matter in ChipIn:

| Link | Route | Purpose |
|---|---|---|
| `chipin:///join/<token>` | `src/app/join/[token].tsx` | Invite → join a group |
| `chipin:///auth-callback?code=…` | `src/app/auth-callback.tsx` | Email confirmation lands here |
| `chipin:///reset-password?code=…` | `src/app/reset-password.tsx` | Password recovery lands here |

Both are generated with `Linking.createURL(path, { isTripleSlashed: true })`.

## Why triple-slashed

`Linking.createURL('join/abc')` defaults to `isTripleSlashed: false` and produces:

```
chipin://join/abc     ->  hostname = "join",  path = "abc"      ❌
chipin:///join/abc    ->  hostname = null,    path = "join/abc" ✅
```

In the first form the router matches `join/[token]` against a path of just
`abc`, so the `token` param arrives **undefined**. That caused the join screen to
sit on "Joining group…" forever. The screen now also recovers the token by
parsing the raw URL, and shows an error instead of spinning if it truly can't.

## Required Supabase dashboard config

Without this the confirmation email points at `http://localhost:3000` (the
default Site URL) and goes nowhere.

**Authentication → URL Configuration:**

1. **Site URL**: `chipin://auth-callback`
   Used as the fallback when no `redirectTo` is supplied.
2. **Redirect URLs** (allow-list) — add all of:
   ```
   chipin://**
   ```
   A URL that isn't on this list is silently replaced with the Site URL, which
   is the usual reason a "fixed" redirect still goes to the wrong place.

**Authentication → Providers → Email:** keep "Confirm email" **on** for real
testers. (It was off during development so smoke tests could sign in instantly.)

**Email templates:** the default *Confirm signup* template uses
`{{ .ConfirmationURL }}`, which already carries the `redirect_to` we pass from
the app — no edit needed. If a template hardcodes `{{ .SiteURL }}`, swap it for
`{{ .RedirectTo }}`.

## How the confirmation flow works now

1. `signUp()` passes `emailRedirectTo: chipin:///auth-callback`.
2. Supabase emails a link to its own `/auth/v1/verify` endpoint.
3. Tapping it verifies the address, then redirects to `chipin:///auth-callback`.
4. `auth-callback.tsx` handles **both** shapes, so it works regardless of the
   project's flow type:
   - PKCE → `?code=…` → `exchangeCodeForSession`
   - implicit → `#access_token=…` → `setSession`
5. Session established → root gate routes into `(app)` → any pending invite is
   redeemed → user lands in the group.

The client is set to `flowType: 'pkce'` (recommended for mobile).

## Password reset

1. Sign in → "Forgot password?" → `(auth)/forgot-password` collects the email.
2. `resetPasswordForEmail()` with `redirectTo: chipin:///reset-password`.
   A **separate route** rather than a marker param on `auth-callback`: it makes
   recovery unambiguous without depending on Supabase preserving extra query
   params through its redirect.
3. The link establishes a short-lived session — that session is the authority to
   change the password, so `reset-password` waits for the exchange to succeed
   before showing the form.
4. `updateUser({ password })`, then straight into the app.

The root gate has to let `reset-password` through **both** signed-out (before the
exchange) and signed-in (after it). Without the second case the recovery session
would immediately bounce the user into `(app)`, skipping the entire point.

Supabase returns 200 for unknown addresses as well as real ones, so the request
screen can't be used to discover who has an account. The confirmation copy says
"if an account exists" to match.

## Known limitation: PKCE is device-bound

The PKCE code verifier is stored on the device that called `signUp`. Opening the
confirmation email on a **different** device can't complete the exchange. The
callback screen explains this and offers a direct sign-in instead. This is
standard for PKCE and not worth engineering around — after confirming, the user
can simply sign in normally.

## Testing deep links

Deep links do **not** resolve in Expo Go (it intercepts custom schemes), and in
Expo Go `createURL` emits `exp://<lan-ip>:8081/--/…`, which changes per network.
Verify in a dev build or TestFlight build.

Simulate without a real invite:

```bash
npx uri-scheme open "chipin:///join/SOME_TOKEN" --ios
```
