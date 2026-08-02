# Pre-launch audit — public beta

Audited against the state of the repo and the live Supabase project.
External TestFlight is a higher bar than internal: it needs **Beta App Review**
(~24h) and a **privacy policy URL**.

## Blockers

### 1. "Confirm email" is OFF — verified live
A signup right now returns a session immediately, which means **anyone can
register with an email address they do not own**. Fine while smoke-testing;
not fine with strangers. Turn it on: Auth → Providers → Email → Confirm email.

**Order matters — do #2 first.** Turning confirmation on while the redirect URLs
are unset sends every new tester a confirmation link that lands on
`http://localhost:3000` and dead-ends. That combination is worse than either
setting alone.

### 2. Supabase redirect URLs are unset
Auth → URL Configuration:
- **Site URL** → `chipin://auth-callback`
- **Redirect URLs** → add `chipin://**`

A redirect not on the allow-list is silently replaced with the Site URL, which
is the usual reason a "fixed" redirect still goes to the wrong place.

### 3. No password reset
There is no forgot-password flow. A tester who forgets their password is locked
out permanently with no self-service recovery — a guaranteed support request and
a bad first impression. Needs `supabase.auth.resetPasswordForEmail()`, a request
screen, and a set-new-password screen wired to the existing `auth-callback`
route (which already handles recovery-type deep links).

### 4. No privacy policy
Required by Apple for external TestFlight distribution. Must disclose what is
collected: email, name, optional phone, group photos, and expense
descriptions/amounts — all linked to the user's identity.

### 5. The whole app is uncommitted
`git log` shows a single "Initial commit" (the bare Expo scaffold). Every
feature — all of `src/lib`, `src/app/(app)`, `supabase/`, `eas.json` — is
untracked or modified. There is no history, no rollback point, and EAS builds
from git state. Commit before building again.

## Should fix before strangers use it

### 6. `pg_net` may not be enabled
Push notifications send from Postgres via `pg_net`. If the extension didn't
create itself, notifications silently never send (the trigger swallows errors by
design, so nothing surfaces). Check Database → Extensions.

### 7. No way to leave or delete a group
The RLS policies allow both (a member may delete their own membership; the
creator may delete the group) but **no UI exposes either**. A tester who joins
the wrong group is stuck with it permanently.

### 8. Test accounts still in the project
Dozens of `chipin-*`, `audit-*`, `dbg*`, `bal-*`, `dm3-*` users from smoke
testing. Deleting them needs the dependency-order SQL (financial FKs are
RESTRICT), or the new in-app deletion.

### 9. No crash or error reporting
Nothing reports runtime failures. During a beta that means relying on testers to
describe problems accurately. Sentry or similar would pay for itself here.

## Verified healthy

- ✅ `.env` is gitignored and untracked; no service-role key anywhere in the repo
- ✅ Only the publishable (RLS-protected) key is committed, in `eas.json`
- ✅ No `console.log`, TODO or FIXME left in app code
- ✅ `npm audit`: 11 moderate, **0 high, 0 critical**
- ✅ `npm ci --include=dev` exits 0 (the EAS install step)
- ✅ Export compliance declared (`ITSAppUsesNonExemptEncryption: false`)
- ✅ Photo-library permission string present
- ✅ In-app account deletion exists (App Store guideline 5.1.1(v))
- ✅ App icon is opaque and square; splash is full-screen
- ✅ RLS verified by smoke tests across every table, including outsider-denial
- ✅ 29 unit tests passing (money math, debt simplification, theme contrast)

## Also needed in App Store Connect

- App Privacy questionnaire (data types + linkage)
- Beta App Review submission for external testers
- Test information: what to test, and a contact email
- `app.json` version is `1.0.0` while `package.json` says `1.0.1` — harmless,
  but iOS uses the `app.json` value
