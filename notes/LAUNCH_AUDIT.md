# Pre-launch audit — public beta

Audited against the state of the repo and the live Supabase project.
External TestFlight is a higher bar than internal: it needs **Beta App Review**
(~24h) and a **privacy policy URL**.

## Blockers

### 1. "Confirm email" is OFF — STILL OPEN (re-verified 3 Aug 2026)
A signup right now still returns a session immediately, so **anyone can register
with an email address they do not own**. This is the last blocker.

It was switched off repeatedly to run smoke tests (they provision throwaway users
via `signUp` and need the session back), and has not been switched on since.
Turn it on: Auth → Providers → Email → Confirm email.

Its dependency (#2) is now satisfied, so enabling it is safe — confirmation links
will reach the app instead of localhost.

Verify with a signup probe: if `access_token` comes back, it is still off.

### 2. ~~Supabase redirect URLs~~ — DONE
Site URL `chipin://auth-callback`, redirect allow-list `chipin://**`.
Cannot be verified remotely (the setting isn't exposed by the API); confirmed by
the project owner. First real proof will be a confirmation or reset email
actually opening the app.

### 3. ~~No password reset~~ — DONE
"Forgot password?" on sign-in → email → `chipin:///reset-password` → set a new
one. See notes/AUTH_DEEP_LINKS.md. Note this depends on blocker #2: without the
redirect URLs configured, the reset email lands on localhost like every other
auth link.

### 4. ~~No privacy policy~~ — DONE
Live and returning 200:
**https://marchesed.github.io/chip-in/privacy.html**

Served by GitHub Pages from `docs/` in this repo. Written from the actual schema,
and describes current behaviour — **it states there is no analytics or crash
reporting, so it must be updated if #9 is ever added.**

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

### 7. ~~No way to leave a group~~ — DONE
"Leave group" on group settings, gated on being settled up (see below for why).
The last member leaving deletes the group and its history.

### 7b. ~~Departures can unbalance a group~~ — FIXED (0017)
`group_balances` is derived FROM `group_members`, so removing a membership row
erases that person from the group's accounting while their expenses remain.
Measured on a balanced group:

    before: A +2000, B -2000   (sum 0)
    after:  B -2000            (sum -2000)

B owes money to nobody, and simplification emits no transfer because there is no
creditor left — so B can never settle.

`leave_group` avoids this by refusing while the caller's net is non-zero.
**`delete_my_account` (M8) still has the hole**, and cannot use the same guard:
Apple requires account deletion to work, so it can't be blocked on a balance.

`group_balances` is now driven by everyone with financial history in the group
(members ∪ payers ∪ share-holders ∪ settlement parties) rather than by current
membership, so a departure never erases anyone's position. `settlements` insert
was relaxed in step with it — the caller must still be a member, but the two
parties only need to be participants, otherwise a debt owed to someone who
deleted their account could never be cleared.

Verified: A deletes their account while owed $20 → the group still sums to zero,
B still sees the debt (as "Deleted user"), and B can settle it. Plus regressions
across zero state, three-way splits, settlements, duplicate rows, outsider
isolation, and leave_group's settled-up rule.

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
