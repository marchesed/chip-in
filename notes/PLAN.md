# ChipIn — Implementation Plan

Mobile cost-splitting app (Splitwise-style). Expo (React Native) + Expo Router + Supabase.

Status: **Planning complete. Building in phases.** No Supabase project provisioned yet — code reads keys from env; schema ships as migrations to apply later.

---

## Progress

- [x] **M1 — Scaffold + Auth**: Expo Router, Supabase client, env plumbing, session gate, sign-up/in, profile trigger + edit screen
- [x] **M2 — Groups + splits**: CRUD, member management, per-member default split (sum-to-100), RLS + `is_group_member`
- [x] **M3 — Invite + deep link**: `app.json` scheme, invite create, QR render, `chipin://join/{token}`, `join_group` RPC + landing
- [x] **M4 — Expenses**: add-expense form, per-expense split override, `splitAmount`, shares insert, expense list
- [x] **M5 — Balances**: `group_balances` view, `simplify.ts`, balances card on the group page
- [x] **M6 — Settle-up**: mark simplified debts paid → `settlements` insert, balance recompute, settlement history
      (push notifications deferred — see backlog)
- [x] **M7 — Custom group image**: upload/change a group photo (private Supabase Storage), show it on the group list + settings
- [x] **Colour themes**: 5 full palettes incl. dark, WCAG-checked, saved per user on the profile
- [x] **M8 — In-app account deletion** (required before App Store review)
- [x] **M9 — Quick actions**: home-screen long-press shortcut straight to add-expense in the most recently used group

---

## Setup / running

1. Create a Supabase project, then in **Project Settings → API** copy the URL and anon key.
2. `cp .env.example .env` and paste both values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
3. Apply migrations in `supabase/migrations/` (SQL editor, or `supabase db push` with the CLI). M1 = `0001_profiles.sql`.
4. In **Auth → Providers**, ensure Email is enabled. (Turn *off* "Confirm email" for the fastest dev loop, or the sign-up screen will ask you to confirm before signing in.)
5. `npm start`, then open in Expo Go / a simulator.

Without a `.env`, the app throws a clear error at launch by design — the anon key is intentionally not committed.

## Key architecture decisions

**1. Money as integer minor units (cents), everywhere.**
Store `amount` as `bigint` cents in Postgres and JS — never floats. `$10.00 -> 1000`. Kills float drift in split math and balance sums. Format to dollars only at the display edge.

**2. Split rounding: percents are config, cents are truth.**
`expense_shares` keeps both `percent` (the rule) and `amount_owed` (materialized cents). When splitting: compute each share from percent, floor to cents, then distribute leftover cent(s) via largest-remainder so shares sum *exactly* to the total. Deterministic and testable.

**3. Balances = Postgres view; simplification = TS module.**
- `group_balances` view computes each member's net (sum paid − sum owed ± settlements) — authoritative, Realtime-friendly.
- Debt-simplification (min-cash-flow) runs in a shared, unit-tested TS module on the client.

**4. Membership checks via `SECURITY DEFINER` functions to avoid RLS recursion.**
An `is_group_member(gid)` helper backs every policy. A self-referencing `group_members` policy would recurse; the definer function breaks the cycle.

**5. Join flow goes through an RPC, not raw RLS insert.**
Invitee isn't a member yet, so no policy lets them insert into `group_members`. Deep link `chipin://join/{token}` -> `join_group(token)` RPC (`SECURITY DEFINER`) validates token + expiry, inserts membership, returns the group.

**6. Profiles auto-created by trigger.**
`handle_new_user` trigger on `auth.users` inserts a `profiles` row on signup.

---

## Repo structure (Expo Router)

```
app/
  (auth)/          sign-in, sign-up
  (app)/
    index          group list
    group/[id]/    index (balance card + expense list), settings, invite,
                   add-expense, settle-up
    join/[token]   deep-link landing -> join_group RPC
    profile
  _layout.tsx      session gate (redirect on auth state)
lib/
  supabase.ts      client (reads EXPO_PUBLIC_SUPABASE_* env)
  money.ts         cents<->display, split-with-remainder
  simplify.ts      debt simplification + tests
  api/             typed data-access wrappers per table
supabase/
  migrations/      numbered SQL (schema, RLS, functions, triggers, views)
  seed.sql
```

---

## Data model

All money columns are `bigint` cents.

- **profiles** (id, name, avatar, phone/email) — created by `handle_new_user` trigger.
- **groups** (id, name, type, currency, created_by, created_at)
- **group_members** (group_id, user_id, default_split_percent numeric(5,2)) — composite PK `(group_id, user_id)`.
- **invites** (id, group_id, token unique, created_by, expires_at, ...reuse policy TBD)
- **expenses** (id, group_id, paid_by, amount bigint, description, date, created_at)
- **expense_shares** (expense_id, user_id, percent numeric(5,2), amount_owed bigint)
- **settlements** (id, group_id, from_user, to_user, amount bigint, settled_at)

Constraints:
- Trigger/CHECK: per-expense shares sum to the expense amount.
- App-level: member split percents sum to 100.

---

## Core algorithms

- **`splitAmount(totalCents, [{userId, percent}])`** — floor each share, distribute remainder by largest fractional part (deterministic tie-break). Returns exact cents summing to total.
- **`simplify(netBalancesByUser)`** — greedy min-cash-flow: match max-creditor with max-debtor, emit `min(|amounts|)`, repeat. Yields ≤ n−1 settlements. Tested: two-party, cycles, rounding edges.

---

## Decisions (defaults locked unless changed)

1. **App scheme**: `chipin://`
2. **Currency**: single currency per group (`currency` column).
3. **Invites**: reusable-until-expiry.
4. **Payer**: single payer per expense; schema structured so multi-payer is additive later.

(Update this section if any default changes.)

---

## M7 — Custom group image (planned)

Let a member set/replace a group's photo, shown on the group list and detail.

- **Storage**: a Supabase Storage bucket `group-images` (public read, or signed URLs). RLS/storage policy: only group members can upload/replace for their group; path keyed by group id (e.g. `group-images/{group_id}.jpg`).
- **Schema**: add `groups.image_url text` (migration). Update the `group_balances`/detail reads to include it.
- **Client**: `expo-image-picker` to pick/crop, upload the file to Storage, then write the public URL to `groups.image_url`. Render with `expo-image` (already a dep) with the letter-avatar as fallback.
- **Where**: an edit affordance on the group detail header; thumbnail on the groups list rows.
- **Note**: image picking is a native module — verify in the dev build, not Expo Go.

## M8 — In-app account deletion (planned)

Apple requires in-app account deletion for any app offering account creation
(App Store guideline 5.1.1(v)), so this gates public release.

**The constraint that shapes everything:** `groups.created_by`, `expenses.paid_by`,
`expense_shares.user_id` and `settlements.from_user/to_user` are all
`ON DELETE RESTRICT`. That is deliberate — hard-deleting someone who appears in
expense history would corrupt every other member's balances. So deletion is
**anonymise the person, keep the ledger**:

1. Blank the profile: name → "Deleted user", email/phone/avatar → null, set `deleted_at`.
2. Remove their `group_members` rows (they vanish from rosters and lose access).
3. Delete their `device_tokens` (push stops immediately).
4. Delete invites they created.
5. Delete any group left with **no remaining members** — it would otherwise be
   invisible to everyone under RLS and just sit there.
6. Delete the `auth.users` row so the account can no longer sign in.

**Blocker to solve in the migration:** `profiles.id` currently references
`auth.users(id) ON DELETE CASCADE`, so step 6 would cascade into deleting the
profile row and hit the RESTRICT constraints — the whole transaction would fail.
The fix is to drop that FK so an anonymised profile can outlive its auth user.
Profiles are still created by the `handle_new_user` trigger; the constraint is
what has to go, not the mechanism.

Delivered as a `delete_my_account()` SECURITY DEFINER RPC (it needs rights on the
`auth` schema), plus a destructive confirm flow on the profile screen and a
sign-out afterwards. Smoke test must verify: the account can't sign in again,
other members' balances are unchanged, and the person shows as "Deleted user" in
existing expenses.

Worth telling users plainly in the confirm dialog: shared expense history is
retained in anonymised form because other people's balances depend on it.

## M9 — Quick actions (planned)

Long-press the home-screen icon → **Add expense** → opens straight into the
add-expense form for the most recently used group.

- `expo-quick-actions` (v6.x, peer dep `expo: *`) — native module, so it needs a
  rebuild and cannot be verified in Expo Go.
- "Most recently used" is tracked in AsyncStorage, written whenever a group
  screen is opened. No schema change.
- Routing: the action carries the group id and deep-links to
  `/(app)/group/<id>/add-expense`.
- Fallbacks that must behave sensibly: signed out → land on sign-in and continue
  after auth (same pending-intent pattern as invites); no recent group, or that
  group has since been deleted/left → open the groups list rather than erroring.
- The action should only be registered once the user actually has a group.

## RLS gotcha worth remembering

**Subqueries inside a policy are themselves subject to RLS.** This has caused two
bugs now:

1. `group_members` policies that referenced `group_members` recursed — solved by
   making `is_group_member()` SECURITY DEFINER (0002).
2. A policy tried `not exists (select 1 from group_members where group_id = id)`
   to detect an empty group. A non-member can't see other people's membership
   rows, so it always returned "empty" and the check passed for everyone
   (0014 → fixed in 0015 with the SECURITY DEFINER `group_has_members()`).

If a policy needs to know something about rows the caller can't see, it must ask
a SECURITY DEFINER function. A plain subquery silently returns the caller's
filtered view instead of the truth.

## Testing note

Smoke tests provision throwaway users via `signUp` and use the returned session,
which only works while **Auth → Providers → Email → "Confirm email" is OFF**. With
it on (as it must be for real testers), signup returns no `access_token` and every
smoke test fails at setup. Toggle it off for the run and back on afterwards, or set
up a **separate Supabase project for testing** (confirmation permanently off, zero
contact with beta users) — the cleaner long-term answer now that real people use
the production project.

## Backlog (deferred)

- ~~Account deletion~~ — promoted to **M8** above.
- ~~**Push notifications**~~ — done (migration 0010). Postgres sends directly via
  `pg_net` from a trigger on `expenses`; no Edge Function or CLI involved. See
  the note below on what remains unverified.
- **Notify on settlements too.** Only expense-added fires a push today; recording
  a settlement is silent. Same trigger pattern would cover it.
- **Push delivery is unverified end-to-end.** Smoke tests confirm token storage,
  RLS, recipient selection, and that a push failure never blocks the expense
  write — but delivery to a real phone can only be checked on a device build.
  Requires `pg_net` enabled and APNs credentials from `eas build`. Needs `expo-notifications`, push credentials via EAS, a device-token table, and a server-side trigger (Supabase Edge Function or DB webhook) to fire on new expenses/settlements. Deferred as its own chunk of work rather than a tail-end of M6.
- **Partial settlements.** Tapping a transfer settles the full simplified amount. Recording a partial payment (custom amount) would need an amount input on the confirm step; the schema already supports it.
- **Date picker on add-expense.** Date defaults to today; a picker needs `@react-native-community/datetimepicker`.

- **Sign in with Apple.** Code is small (~half a day): `expo-apple-authentication` + `supabase.auth.signInWithIdToken({ provider: 'apple' })`, plus the SHA-256 nonce dance (raw to Supabase, hashed to Apple) and capturing `fullName` on first authorization (Apple only returns it once; email may be a private-relay address, so the profile trigger's email-local-part fallback looks bad for Apple users). Real cost is external: Apple Developer Program ($99/yr), enabling the capability, configuring Apple as a Supabase provider, and **needing an EAS dev build to test — it does not run in Expo Go**. Defer until doing EAS builds anyway. iOS-only is the clean path; Android/Web would need the separate OAuth web redirect flow. Note: App Store guideline 4.8 only *requires* it if other third-party social logins are offered — email/password alone doesn't trigger that.
