# Reimbursements (GitHub Pages + Supabase edition)

Your brother submits bills and receipts, you log his pocket money separately,
and both of you can see exactly what has been paid and what is still owed.
It runs entirely as static files: GitHub Pages hosts the HTML/CSS/JS for free,
and a free Supabase project provides the database, login, and photo storage,
all called directly from the browser.

There's no server of your own to run or pay for. The tradeoff: a free Supabase
project auto-pauses after 7 days with no activity, and needs a manual "resume"
click in the Supabase dashboard to wake back up. Your data isn't lost when that
happens - it just needs that one click before the app works again.

## Already have this running? Read this first

**Almost nothing changes in Supabase.** There is no new table, column, index
or trigger in this version - the per-bill payment status you now see is derived
in the browser, not stored.

There is one small thing to run: **`supabase/migration_v4.sql`**. Your
brother's account now reads two tables it never read before - `pocket_money`
(to show him the allowance you've logged) and `profiles` (to show him *your*
name). Both are supposed to be readable by any logged-in user, but if your
project was built from the original v1 schema, those two read policies were
never exercised by his account, so a stricter setting there would have gone
unnoticed until now. The file just guarantees them. It changes no data, grants
nothing beyond reading those two tables, and is a no-op if you're already
correct - and it opens with a query you can run first if you'd rather look
before changing anything.

If you're coming from an older copy and haven't run these yet, run them once
each in **SQL Editor -> New query**, in order. Both are safe to re-run if
you're unsure:

- **`supabase/migration_v2.sql`** - full/partial settlements, plus editing and
  deleting bills, pocket money entries, and payment records after the fact.
- **`supabase/migration_v3.sql`** - the Activity tab (payer only): an audit log
  driven by database triggers.
- **`supabase/migration_v4.sql`** - the two read policies described above.

Then pull the updated files and push them to GitHub - see "Updating the app
later" below.

## What's new in this version

Previously the payer got a dashboard and your brother got a bare list of the
bills he'd submitted - he couldn't tell which of them had been paid, how much
had come back, or whether a chunk of the total had been cleared. That's fixed,
and both sides were rebuilt around the same idea.

**Every bill now has a visible payment status.** The database deliberately
doesn't tie a payment to a bill - what's owed is just (all bills - all
payments), so any amount can be paid at any time. That's flexible to record but
impossible to read. The app now derives the link **oldest bill first**: each
payment, in date order, is applied to the oldest bill that still has a balance.
So every bill shows as **Paid** / **Part paid** / **Awaiting payment**, with the
date it was cleared and how much of it is still open - all computed from rows
that were already there, with nothing new stored.

**Your brother now has a real dashboard**, answering in order: how much he's
owed, how much of what he submitted has been cleared (with a progress bar),
which bills are still open, and what the last payment was *and which bills it
covered*. Plus a new **Received** tab: every payment with the bills it cleared,
and all pocket money, in one place.

**The payer's dashboard was rebuilt too** - a bill-status breakdown you can tap
to jump straight to those bills, an oldest-open-bill warning, a balance-over-
time chart, and a **live preview when settling up** that tells you which bills
the amount you're typing will actually clear before you record it.

Also: dark mode (follows your phone, with a manual toggle), a
"time travel" control to view the ledger as of any past date, status filters
and CSV exports that now include each bill's paid/outstanding/status columns,
and the Tailwind CDN dependency dropped in favour of a small self-contained
stylesheet.

## Overview of what you're setting up

1. A Supabase project (free) - the database, login system, and photo storage.
2. Two accounts inside it - one for you, one for your brother.
3. This static site, pushed to a GitHub repo with GitHub Pages turned on.

## Step 1: Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click "New project". Pick any name and a database password (you won't
   need to remember this password day-to-day - Supabase manages it).
3. Wait a minute or two for the project to finish provisioning.

## Step 2: Set up the database

1. In your new project, open **SQL Editor** (left sidebar) -> **New query**.
2. Open `supabase/schema.sql` from this folder, copy its entire contents,
   paste into the SQL Editor, and click **Run**.
3. This creates the `profiles`, `pocket_money`, `reimbursements`,
   `settlements`, and `audit_log` tables, all the access-control rules, the
   dashboard summary function, the audit-log triggers, and a private
   `receipts` storage bucket for photos.

   (Upgrading an existing project instead of starting fresh? Use the migration
   files - see "Already have this running?" above. `schema.sql` already
   includes everything for a fresh project, so you don't need the migrations
   too.)

## Step 3: Create the two accounts

1. Go to **Authentication -> Users** (left sidebar) -> **Add user** ->
   **Create new user**.
2. Enter your own email and a password. Tick **Auto Confirm User** (so you
   don't need to click an email confirmation link). Create it.
3. Repeat for your brother's email + a password he'll use to log in.
4. For each user you just created, click into it and copy its **User UID**
   (a long id like `3fa2...`).
5. Back in **SQL Editor -> New query**, run this, once per person, filling
   in the real UID, role, and name:

   ```sql
   insert into profiles (id, role, display_name)
   values ('paste-the-user-uid-here', 'payer', 'Suraj');
   ```

   ```sql
   insert into profiles (id, role, display_name)
   values ('paste-the-brothers-user-uid-here', 'brother', 'Brother''s name');
   ```

   The `role` must be exactly `payer` or `brother` - that's what the app uses
   to decide which screens and permissions someone gets. The `display_name`
   is what the other person sees throughout the app ("You owe Aman"), so
   use a real first name.

## Step 4: Connect the app to your project

1. In Supabase, go to **Project Settings -> API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/supabaseClient.js` in this folder and paste them in:

   ```js
   const SUPABASE_URL = 'https://your-project-ref.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-public-key';
   ```

   This key is meant to be public - it goes out to every visitor's browser
   either way. All the real access control is enforced by the database
   policies from Step 2, not by hiding this key.

## Step 5: Put it on GitHub Pages

1. Create a new **public** (or private, if your GitHub plan allows Pages on
   private repos) repository on GitHub - e.g. `reimbursements`.
2. Push the contents of this folder to it:

   ```bash
   cd reimbursements
   git init
   git add .
   git commit -m "Reimbursements app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. On GitHub, go to the repo's **Settings -> Pages**.
4. Under **Build and deployment -> Source**, choose **Deploy from a
   branch**, set branch to `main` and folder to `/ (root)`, then **Save**.
5. GitHub takes a minute or two to publish. Your app will be live at:

   ```
   https://<your-username>.github.io/<repo-name>/
   ```

Both of you can open that link, add it to your phone's home screen (Safari:
Share -> "Add to Home Screen"; Chrome/Android: menu -> "Add to Home screen"),
and log in with the email/password you set up in Step 3.

## How the ledger works

Two separate tracks:

**Pocket money** is a running log you add to whenever you hand over allowance.
Nothing to settle - it's just a record, and it never counts towards what you
owe. Both of you can see it; only the payer can add to it.

**Reimbursements** are bills your brother submits, with an optional photo.
There's no per-bill "settled" column in the database. What's owed is simply
the total of all bills minus the total of all payments, so you can pay off any
chunk at any time without matching payments to specific bills.

**The app derives the match anyway, oldest bill first.** Every payment, in date
order, is applied to the oldest bill that still has a balance - the way a
shopkeeper's ledger works. It's stable (a new bill never re-opens an older one)
and it means both of you see the same per-bill status without the database
having to store it:

- **Paid** - fully covered, showing the date it was cleared.
- **Part paid** - showing how much has come in and how much is still open.
- **Awaiting payment** - nothing applied to it yet.

Pay more than you owe and the surplus is held as **credit** against future
bills. Every bill, pocket money entry, and payment can still be edited or
deleted later; the whole allocation simply recomputes from the stored rows, so
it's always consistent with whatever the data currently says.

### Colour choices

The charts use a palette validated for colour-blind separation and contrast
against both the light and dark surfaces (blue = bills submitted, orange =
pocket money, green = paid back). Series colour follows the *entity*, never its
position in a list, so filtering never repaints the remaining series. Payment
status is always shown as an icon **and** a word, never colour alone, and the
month-by-month chart has a "Show numbers" table view for the same reason. If
you change these, keep those properties.

## Project structure

```
index.html                  - page shell (login screen + app shell)
css/style.css               - the whole design system: tokens, components, light/dark
manifest.json               - lets you "Add to Home Screen" on mobile

js/supabaseClient.js        - your project URL + anon key (fill in Step 4)
js/app.js                   - bootstrap: auth, theme, tab bar, route table
js/router.js                - tab routing
js/store.js                 - session state + every Supabase read/write
js/ledger.js                - the oldest-first allocation engine (all the money logic)
js/charts.js                - Chart.js wrappers + the validated palette
js/ui.js                    - reusable HTML components (tiles, pills, rows, meters)
js/icons.js                 - inline SVG icon set
js/util.js                  - formatting, CSV export, toasts

js/views/home.js            - the dashboard, both roles
js/views/bills.js           - bills list with status, both roles
js/views/addBill.js         - submit a bill (payee)
js/views/settle.js          - settle up, with the live allocation preview (payer)
js/views/pocket.js          - pocket money (payer)
js/views/received.js        - payments + pocket money received (payee)
js/views/activity.js        - audit log (payer)

supabase/schema.sql         - run once, for a BRAND NEW Supabase project
supabase/migration_v2.sql   - run once, to upgrade an EXISTING project (settlements, edit/delete)
supabase/migration_v3.sql   - run once, to upgrade an EXISTING project (Activity/audit log)
supabase/migration_v4.sql   - run once, to upgrade an EXISTING project (payee read policies)
```

`js/ledger.js` is the piece worth knowing: it's pure (rows in, derived ledger
out) with no DOM or network access, so it can be reasoned about and tested on
its own, and every screen reads its numbers from it rather than recomputing.

## If the app stops working after a quiet week

Free Supabase projects pause themselves after 7 days of no requests. If login
suddenly fails, go to your Supabase project dashboard - it'll show a "paused"
banner with a **Restore/Resume** button. Click it, wait a minute, and the app
works again with all your data intact.

## Updating the app later

Whenever you want to change something, edit the files in this folder and push
again:

```bash
git add .
git commit -m "describe your change"
git push
```

GitHub Pages picks up the new version automatically within a minute or two.

## Things worth knowing

- **Photos are private.** The receipts bucket isn't public - the app generates
  a temporary (1 hour) signed link each time it shows a photo, so random people
  can't guess a photo's URL and view it.
- **Deleting a bill that's already been paid against** re-applies that money to
  the other open bills, since payments aren't tied to bills. The app warns you
  before you confirm.
- **Deleting a payment record puts that amount back into what's owed** - useful
  for correcting a mistaken entry, but worth double-checking first.
- **Editing a bill doesn't let you swap its photo.** You can change the amount,
  description, or date; to change the photo, delete the bill and submit a new
  one.
- **Deleted bills leave the photo file behind** in storage (harmless, just
  slightly wastes your free storage quota - 1GB is a lot of receipt photos).
- **The model assumes only your brother submits bills.** He can see every
  payment but, by design, only his own bills - so if the payer account also
  submitted bills, your brother's "still owed" figure would be too low. Keep
  bills coming from the one account and the two views always agree.
- **The Activity tab is payer-only**, enforced by the database, not just hidden
  in the UI. Its history starts from when you ran `migration_v3.sql` - earlier
  changes weren't captured and aren't reconstructed.
- **No "forgot password" flow is wired up.** Reset it from the Supabase
  dashboard (Authentication -> Users -> select the user).
- **Dark mode** follows your phone's setting by default; the sun/moon button in
  the header overrides it and remembers your choice on that device.
