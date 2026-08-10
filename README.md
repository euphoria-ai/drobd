# drobe

An AI fashion assistant that doubles as an inventory manager. Photograph
anything you own; it gets cut out, named, categorised, and dropped into a
physics pile you can tip around by tilting your phone.

```
drobe/
├─ app/                    Expo (SDK 57) React Native app
├─ server/                 FastAPI — stateless AI pipeline
└─ supabase/migrations/    Postgres schema, RLS, storage policies
```

The two halves are deliberately independent:

- **Photo → FastAPI → cutout + labels.** No database credentials, no state.
- **App → Supabase → rows + storage.** The app persists directly; row level
  security is the only authorization layer.

So a server outage degrades the app to "can't add new items" rather than
"can't open".

---

## Design

Monochrome. Pure black or pure white ground, a neutral ramp between, and no
brand accent — the garments are the only colour on screen. Both themes are
first-class and switchable in Settings.

One consequence worth knowing about: the reference app this is modelled on
bakes a white outline into every sticker, which only works because it sits on a
single cream background. Supporting both grounds makes that impossible, so
**the server returns clean transparent cutouts with no outline**, and the stroke
is generated on-device into a cached Skia texture, coloured to contrast with
whichever theme is active. It costs one pass per image per theme, not per frame.

---

## Running it

### 1. Server

```bash
cd server && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
```

Copy `.env.example` to `.env` and set `GROQ_API_KEY`. Then:

```bash
cd server && .venv/Scripts/python -m uvicorn drobe.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: the phone reaches this over your LAN, and `localhost`
on a phone means the phone.

First start downloads the BiRefNet weights (~200MB) and takes a few minutes.
The `Dockerfile` bakes them into the image so deployments don't.

Check a real photo end to end and eyeball the cut:

```bash
cd server && .venv/Scripts/python -m drobe.scripts.try_image photo.jpg
```

That writes the cutout on both a black and a white ground, because a cut that
looks clean on one can look terrible on the other.

Tests:

```bash
cd server && .venv/Scripts/python -m pytest
```

The segmentation test is opt-in behind `DROBE_TEST_SEGMENT=1` since it pulls
the model.

### 2. Supabase — already provisioned

Project `drobe` (ref `pfarlupjgboiilsacmbk`) exists, all three migrations are
applied, RLS is on for every table, and the security advisor is clean.

**One manual step remains that no tool can do for you:** turn on anonymous
sign-ins. The app signs in anonymously on first launch, and without this every
query fails RLS and the app stops at the "Can't start" screen.

> Supabase dashboard → project `drobe` → **Authentication → Sign In / Providers**
> → enable **Anonymous sign-ins** → Save.

If the schema is ever rebuilt, apply `supabase/migrations/*.sql` in numeric
order, then regenerate the hand-written types:

```bash
supabase gen types typescript --project-id pfarlupjgboiilsacmbk > app/src/types/database.ts
```

### 3. App

`app/.env` is already written with the Supabase URL, publishable key, and an
`EXPO_PUBLIC_API_URL` pointing at this machine's Wi-Fi LAN address. If that IP
changes (new network, DHCP lease), update `EXPO_PUBLIC_API_URL` — find the new
one with `ipconfig`.

```bash
cd app && npx expo run:android
```

A **dev build is required** — Skia, Reanimated worklets, matter-js and the
sensors are not in Expo Go. iOS needs a Mac or EAS Build.

---

## Notes for whoever works on this next

- **Model IDs move.** Groq retired the Llama 4 vision models; the pipeline uses
  `qwen/qwen3.6-27b` for image input and `openai/gpt-oss-120b` for the stylist.
  Both are env-configurable. Verify against the Groq docs before assuming.
- **The taxonomy lives in three places** — `server/drobe/schemas.py`,
  `app/src/lib/taxonomy.ts`, and the Postgres enums. They must change together.
- **Row types must be `type`, not `interface`.** supabase-js constrains schemas
  to `Record<string, unknown>`, and interfaces have no implicit index signature,
  so an interface silently collapses the whole schema to `never` and every write
  fails to typecheck with an unhelpful error.
- **`node_modules` in OneDrive is a liability.** Sync contention causes locked
  files and slow installs. Consider excluding `drobe/app/node_modules` and
  `drobe/server/.venv` from sync, or moving the repo outside OneDrive.
