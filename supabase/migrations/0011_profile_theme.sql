-- ChipIn: per-user colour theme, stored on the profile so it follows the user
-- across devices. The app also caches it locally for instant paint on launch.
--
-- Deliberately a plain text column rather than an enum: adding a palette is then
-- an app-only change with no migration, and resolveTheme() in the client falls
-- back to the default for any value it doesn't recognise.

alter table public.profiles
  add column if not exists theme text not null default 'ocean';

comment on column public.profiles.theme is
  'Colour theme name (ocean, forest, sunset, grape, midnight). Unknown values '
  'fall back to the default client-side.';
