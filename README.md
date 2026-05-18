# tq-comments

Drop-in commenting widget for prototypes. Paste one script tag into any HTML page and reviewers can leave pinned comments anchored to UI elements — like Pastel, but yours.

```html
<script src="https://damon-strickland.github.io/tq-comments/public/widget.js"></script>
```

Comments are keyed by URL, so each smol link (or any deployed prototype URL) gets its own thread automatically. No per-page setup.

## Stack

- **Backend**: Supabase (Postgres + PostgREST + Realtime). No custom server.
- **Widget**: vanilla JS, ~470 lines, no build step. Talks directly to Supabase REST using the public anon key + RLS.
- **Identity**: name typed once, saved to browser localStorage (no auth in v1).
- **Real-time**: 3s polling for v1. Supabase Realtime is enabled on the table — flipping the widget to WebSocket subscriptions is a v2 swap.

## Setup (5 minutes)

### 1. Create a Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project. The free tier is fine.

### 2. Apply the schema

Open **SQL Editor** → New query → paste in `schema.sql` → Run.

This creates the `comments` table, an `updated_at` trigger, RLS policies that let the `anon` role read/write, and enables Realtime on the table.

### 3. Grab your API keys

**Project Settings → API** → copy:

- **Project URL** (looks like `https://abc123xyz.supabase.co`)
- **anon public** key (long JWT starting with `eyJ...`)

These are safe to embed in client-side code — RLS controls what `anon` can do.

### 4. Configure the widget

Edit `public/widget.js`, lines 9–12, replace the `REPLACE_WITH_*` placeholders:

```js
const SUPABASE_URL = "https://abc123xyz.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```

(Alternative: leave the placeholders and pass `data-supabase-url` + `data-supabase-key` on the script tag every time you embed. Editing the file is simpler if everyone in your org uses the same Supabase project.)

### 5. Host `widget.js`

This repo is set up to host the widget via **GitHub Pages**. After the initial push, enable Pages on the repo: **Settings → Pages → Source: Deploy from a branch → Branch: `main` → Folder: `/ (root)` → Save**. The widget will be served at `https://<your-user>.github.io/tq-comments/public/widget.js`. Every subsequent `git push` is a deploy.

### 6. Embed in a prototype

```html
<script src="https://damon-strickland.github.io/tq-comments/public/widget.js"></script>
```

That's it. Open the prototype, click the floating "Comments" button, drop a pin, comment.

## Deploying widget updates

After the initial Supabase Storage upload, use `./deploy.sh` to push changes:

```bash
cp .env.example .env
# Edit .env and paste your SUPABASE_SERVICE_KEY (Project Settings → API → service_role)
./deploy.sh
```

The script uploads `public/widget.js` to the `widget` bucket with `Cache-Control: max-age=60`, so existing prototypes pick up the new version within a minute.

⚠️ The service role key is **secret** — it can bypass RLS. `.env` is gitignored; don't commit it or paste it anywhere public.

## Local testing

```bash
npx serve public -p 4444
# or:
python3 -m http.server -d public 4444
```

Open <http://localhost:4444/test.html>.

Note: localhost is a different URL from your deployed prototype, so comments left locally won't appear when you go live (they're keyed by URL). That's a feature, not a bug.

## What's in v1

- Pin-drop comments anywhere on a page
- Threaded replies
- Resolve / unresolve
- Sidebar listing all threads
- Comments persist across viewers (shared backend via Supabase)
- Pins use percentage-of-document coordinates; CSS selector is stored as a fallback (unused in v1)

## What's deferred to v2

- Auth (Google/email) — currently anyone with the anon key can comment as any name. Tighten via RLS + Supabase auth.
- @mentions, notifications, email/Slack.
- Multi-prototype "projects" grouping.
- Browser frame previews (mobile/tablet/desktop).
- Element-anchored pins that survive layout changes (use the stored selector).
- Swap polling → Supabase Realtime WebSocket subscription.
- **The actually interesting one:** comments feeding back into Claude Code to iterate on the prototype.

## Schema

```
comments
├── id            uuid (primary key)
├── url           text (origin + pathname; query/hash stripped)
├── parent_id     uuid (null for top-level pins; replies reference parent)
├── x, y          real (0–1, percentage of document width/height)
├── selector      text (CSS path to clicked element — unused fallback for v1)
├── author        text
├── body          text
├── resolved      boolean
├── created_at    timestamptz
└── updated_at    timestamptz
```

## Layout

```
schema.sql         Postgres schema + RLS policies (paste into Supabase SQL editor)
public/widget.js   The drop-in widget — edit lines 9–12 with your Supabase keys
public/test.html   Local test prototype
```
