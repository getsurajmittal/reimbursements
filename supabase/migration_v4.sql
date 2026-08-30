-- Reimbursements app - upgrade to v4
--
-- Run this ONCE in your EXISTING Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste this whole file -> Run).
--
-- ---------------------------------------------------------------------------
-- Do I actually need this?
-- ---------------------------------------------------------------------------
-- Probably not - but it is cheap to be sure, and it is a no-op if your project
-- is already correct.
--
-- The v4 app introduces a dashboard for the brother/payee account. To draw it,
-- that account now reads two things it never read before:
--
--   1. pocket_money  - so he can see the allowance you have logged.
--   2. profiles      - so the app can show YOUR display name to HIM
--                      ("Total received from Suraj").
--
-- Both are meant to be readable by any logged-in user, and both are declared
-- that way in schema.sql. But if your project was created from the original
-- v1 schema, those two SELECT policies were never exercised by the brother's
-- account, so a stricter policy there would have gone unnoticed until now.
--
-- Everything else the v4 app does was already covered by v2 and v3: bills,
-- settlements, storage, and the audit log are unchanged. There is no new
-- table, column, index, or trigger in this release - the per-bill payment
-- status you now see is derived in the browser, not stored.
--
-- This file only ensures the two read policies exist. It changes no data, and
-- it grants nothing beyond "a logged-in user may read these two tables" -
-- which is exactly what schema.sql already specifies. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Want to look before you leap? Run just this first - it lists what you have
-- today. You are looking for a SELECT policy on `profiles` and on
-- `pocket_money` whose USING clause is `auth.uid() IS NOT NULL`.
-- ---------------------------------------------------------------------------
-- select tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public' and tablename in ('profiles', 'pocket_money')
-- order by tablename, cmd;

-- ---------------------------------------------------------------------------
-- 1. Both accounts can read both profile rows.
--    This exposes only the id, role, and display name of the two people who
--    already share the ledger - there is nothing private in this table.
--    Writes stay closed: you manage profiles yourself from the SQL Editor.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists "profiles are readable by any logged-in user" on profiles;
create policy "profiles are readable by any logged-in user"
  on profiles for select
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 2. Both accounts can read the pocket money log; only the payer can change it.
--    The insert/update/delete policies from earlier versions are left exactly
--    as they are - this touches the read side only.
-- ---------------------------------------------------------------------------
alter table pocket_money enable row level security;

drop policy if exists "pocket money is readable by any logged-in user" on pocket_money;
create policy "pocket money is readable by any logged-in user"
  on pocket_money for select
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Done. Nothing else in the database needs to change for v4.
--
-- Footnote: the app no longer calls the get_summary() function - all totals
-- are now computed in the browser from the rows above, which is what lets both
-- roles see the same figures without a second server-side code path. The
-- function is harmless if left in place, so this file does not drop it.
-- ---------------------------------------------------------------------------
