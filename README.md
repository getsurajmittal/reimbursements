# Reimbursements (GitHub Pages + Supabase edition)

Same app as before - your brother submits bills/receipts, you log his pocket
money separately, see running totals as of any date, and settle bills - but
built to run entirely as static files. GitHub Pages hosts the HTML/CSS/JS for
free; a free Supabase project provides the database, login, and photo
storage, all called directly from the browser.

There's no server of your own to run or pay for. The tradeoff: a free
Supabase project auto-pauses after 7 days with no activity, and needs a
manual "resume" click in the Supabase dashboard to wake back up. Your data
isn't lost when that happens - it just needs that one click before the app
works again.

## Already have this running? Read this first

If you've already created a Supabase project and run the earlier
`schema.sql`, don't run `schema.sql` again - open
**SQL Editor -> New query**, paste in `supabase/migration_v2.sql` instead,
and click **Run**. It upgrades your existing tables in place (nothing is
lost - any bills you'd already marked "settled" are carried forward as
payment records) and adds what's new in this version:

- **Settle in full or in part.** A new **What I Owe** tab shows the total
  you currently owe and lets you record a payment of any amount - pay it
  all off, or knock off part of it - instead of settling each bill one by
  one.
- **Edit and delete.** Bills, pocket money entries, and payment records can
  all be edited or deleted after the fact, not just added.

Then pull the updated `js/app.js` (and this README) into your project folder
and push to GitHub as usual - see "Updating the app later" below.

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
3. This creates the `profiles`, `pocket_money`, `reimbursements`, and
   `settlements` tables, all the access-control rules, the dashboard summary
   function, and a private `receipts` storage bucket for photos.

   (Upgrading an existing project instead of starting fresh? Use
   `supabase/migration_v2.sql` here instead - see "Already have this running?
   Read this first" above.)

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
   to decide which screens and permissions someone gets.

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
   cd reimburse-app-supabase
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

## If the app stops working after a quiet week

Free Supabase projects pause themselves after 7 days of no requests. If
login suddenly fails, go to your Supabase project dashboard - it'll show a
"paused" banner with a **Restore/Resume** button. Click it, wait a minute,
and the app works again with all your data intact.

## Updating the app later

Whenever you want to change something, edit the files in this folder and
push again:

```bash
git add .
git commit -m "describe your change"
git push
```

GitHub Pages picks up the new version automatically within a minute or two.

## Project structure

```
index.html               - page shell (login screen + app shell)
css/style.css            - small additions on top of Tailwind (loaded via CDN)
js/supabaseClient.js     - your project URL + anon key (fill in Step 4)
js/app.js                - all app logic: auth, bills, payments, dashboard
manifest.json            - lets you "Add to Home Screen" on mobile
supabase/schema.sql      - run once, for a BRAND NEW Supabase project
supabase/migration_v2.sql- run once, to upgrade an EXISTING Supabase project
```

## How the ledger works

Two separate tracks: pocket money is a running log you add to whenever you
hand over allowance - nothing to settle, just a record. Reimbursements are
bills your brother submits (with an optional photo) - there's no per-bill
"settled" status; what's owed is simply the total of all bills minus the
total of all payments you've recorded.

The **What I Owe** tab shows that running total and lets you record a
payment against it: the full amount, or any smaller amount for a partial
payment. Payments aren't tied to specific bills, so you don't need to match
them up - pay off a chunk whenever you like and the total owed drops
accordingly. Every bill, pocket money entry, and payment record can be
edited or deleted later if you make a mistake. The Dashboard tab still shows
totals as of any day you pick, for a historical view.

## Things worth knowing

- **Photos are private.** The receipts bucket isn't public - the app
  generates a temporary (1 hour) signed link each time it shows a photo, so
  random people can't guess a photo's URL and view it.
- **Deleted bills leave the photo file behind** in storage (harmless, just
  slightly wastes your free storage quota over time - 1GB is a lot of
  receipt photos, so this is unlikely to matter for a two-person app).
- **Editing a bill doesn't let you swap its photo.** You can change the
  amount, description, or date; to change the photo, delete the bill and
  submit a new one.
- **Deleting a payment record puts that amount back into what's owed** -
  useful for correcting a mistaken entry, but worth double-checking before
  you confirm the delete.
- **No "forgot password" flow is wired up in the UI.** If someone forgets
  their password, reset it from the Supabase dashboard (Authentication ->
  Users -> select the user -> send a password reset, or set a new one
  directly).
- **This is a different deployment from the earlier Node/Docker version** -
  if you later get a Raspberry Pi or mini PC and want to self-host instead
  (no Supabase dependency, no 7-day pause), that version is still available;
  just ask and I can hand it over again.
