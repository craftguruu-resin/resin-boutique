# Database: local machine + Render (same Git repo, no conflicts)

The server **only** reads Postgres from the environment variable **`DATABASE_URL`**.  
There is **no** database URL stored in Git. That is what lets you use **different databases** for your laptop and for production without changing code.

| Where you run | Where `DATABASE_URL` comes from | In Git? |
|---------------|----------------------------------|---------|
| **Your Mac**  | File `server/.env` (you create it) | **No** — `server/.gitignore` lists `.env` |
| **Render**    | Render dashboard → Web Service → **Environment** | **No** — set only in Render UI |

Pushing commits to **GitHub / `main`** updates **code** on Render. It does **not** overwrite or delete Render’s `DATABASE_URL`. Production keeps working until **you** change env vars in Render.

---

## 1) Local (replica on your machine)

1. **Create** `server/.env` (copy from example):
   ```bash
   cd server
   cp .env.example .env
   ```
2. **Choose a local database URL** (only inside `.env` — never commit this file):
   - **Option A — Docker Postgres** (matches `docker-compose.local.yml`):
     ```bash
     docker compose -f docker-compose.local.yml up -d
     ```
     Then in `server/.env` set:
     ```env
     DATABASE_URL=postgresql://craftguru:craftguru_local_dev@127.0.0.1:5432/craftguru
     ```
   - **Option B — Neon “dev”** (separate branch or project): paste that connection string as `DATABASE_URL` in `server/.env` so local work does not touch production data unless you intend to.
3. **Install & migrate** (same commands you would run against any Postgres):
   ```bash
   npm install
   npm run db:migrate
   npm run db:vendor-login
   ```
4. **Start** the API:
   ```bash
   npm start
   ```
5. Check **`http://127.0.0.1:3847/api/health`** — `database.reachable` should be **`true`**.

If `DATABASE_URL` is missing or wrong, the app stays in **“database not configured”** mode (file-based orders fallback).

---

## 2) Production (Render)

1. Render → your **Web Service** → **Environment**.
2. Set **`DATABASE_URL`** to your **production** Neon (or other) connection string — **only here**, not in the repo.
3. Save → redeploy if needed.
4. Run **`npm run db:migrate`** once against **that** database (Render Shell, or your machine with `DATABASE_URL` temporarily set to the prod string — be careful).

Render does **not** read `server/.env` from Git; it only uses dashboard env vars.

---

## 3) What happens when you `git push`

- **Committed:** HTML, JS, CSS, `server/*.js`, `docker-compose.local.yml`, `.env.example`, etc.
- **Not committed:** `server/.env` (your local URL).
- **Unchanged by Git:** Render’s **`DATABASE_URL`** and other secrets.

So: **configure local in `.env`, configure production in Render.** Same codebase, two environments.

---

## 4) Optional: “replica” of prod data

- **Safest:** Neon **branch** or a **dump restore** into a **separate** local or staging database; put that URL only in local `.env`.
- **Avoid** pasting the **live production** `DATABASE_URL` into your daily `.env` unless you know the risk (you can change real customer data).

For more hosting context, see **`HOSTING.md`** in the repo root.
