# Persistent product images (step by step)

Your app stores **file paths** in Postgres (for example `media/catalog/Resin Name Plates/photo.jpg`). The **image bytes** must live on a filesystem that **survives deploys and restarts**.

**Do not use Git** for customer uploads: large binaries, noise in history, and secrets risk.

---

## 1. Understand “free” vs your host

| Where you run | Persistent disk on the same machine? | Notes |
|----------------|----------------------------------------|--------|
| **Render — free web service** | **No** | Ephemeral disk; uploads are lost on redeploy / spin-down. [Render docs: disks are for paid services](https://render.com/docs/disks). |
| **Render — paid instance + disk** | **Yes** | Attach a disk, set `UPLOADED_MEDIA_ROOT` (below). |
| **Your laptop / home server / Oracle Free VPS / any VM** | **Yes** | Use a normal folder on the machine’s disk + `UPLOADED_MEDIA_ROOT`. |

So: **100% free on Render’s free web tier = no true persistent folder on that service.** Free options are: run the API on a machine with a real disk (below), or accept re-uploading after each deploy, or pay for Render + disk / another host with storage.

---

## 2a. Optional: HTTPS image URL (no disk on Render)

On **Inventory → Add product** and **Products → Edit** (vendor rows), you can paste an **`https://…`** image link from Cloudinary or another CDN instead of uploading a file. The URL is stored in Postgres; the guest site loads the image directly from the CDN (see `data.js` `imageUrl`).

---

## 2. What to set (all environments)

Environment variable (server process reads this):

```bash
UPLOADED_MEDIA_ROOT=/absolute/path/to/a/folder/that/never/gets/deleted
```

The app will create and use:

- `…/catalog/`     → served as `/media/catalog/…`
- `…/hero/`        → served as `/media/hero/…`
- `…/raw-materials/` → served as `/media/raw-materials/…`

**Optional overrides** (only if you split locations):

- `CATALOG_MEDIA_ROOT` — catalog only (overrides catalog part of the tree).
- `HERO_MEDIA_ROOT`, `RAW_MATERIALS_MEDIA_ROOT` — see `server/.env.example`.

After changing env vars, **restart the Node server** (redeploy on Render).

---

## 3. Render (paid) — attach disk + env

**Where:** [Render Dashboard](https://dashboard.render.com) → your **Web Service** → **Disks** (or create service with a disk per [Disks documentation](https://render.com/docs/disks)).

1. Open your web service → **Disks** → **Add disk**.
2. Choose size (e.g. 1 GB to start), set **Mount path**, for example:  
   `/var/data/craftguru-media`
3. Save. Render will redeploy.
4. **Environment** tab → add:
   - Key: `UPLOADED_MEDIA_ROOT`  
   - Value: `/var/data/craftguru-media`  
   (must match the mount path exactly.)
5. **Manual Deploy** → **Clear build cache & deploy** (optional; normal deploy is enough after env change).
6. **Restore files:** either re-upload products in the vendor UI, or run the copy script **on that service** after SSH/one-off job if you have access — usually easier to **re-upload** or **SCP/rsync** from your laptop into the mounted path if Render gives you shell (paid features vary).

**Check:** server logs on boot should include a line like  
`Persistent media: catalog=… | hero=… | raw-materials=…`

---

## 4. Free method: run API on a machine with a real disk

Use any always-on (or self-started) machine where **you control the folder**.

### 4a. Same laptop you use for development

1. Create a folder, e.g.  
   - macOS/Linux: `mkdir -p "$HOME/craftguru-media"`  
   - Windows: `C:\craftguru-media`
2. In `server/.env` (not committed; copy from `.env.example`):
   ```bash
   UPLOADED_MEDIA_ROOT=/Users/YOU/craftguru-media
   ```
   Windows example: `UPLOADED_MEDIA_ROOT=C:\\craftguru-media`
3. From `server/`: `npm start`
4. One-time: copy existing bundled images into that tree so built-in catalog paths resolve:
   ```bash
   cd server && npm run media:copy-to-disk
   ```
5. New vendor uploads go into `…/catalog/` automatically and **stay** across `npm start` restarts.

### 4b. Oracle Cloud Always Free (ARM) or other free VPS

1. Create a VM (Ubuntu), open your app port, install Node, clone repo.
2. `sudo mkdir -p /var/lib/craftguru-media && sudo chown $USER /var/lib/craftguru-media`
3. Set in `.env`: `UPLOADED_MEDIA_ROOT=/var/lib/craftguru-media`
4. Run Node with `pm2` or `systemd` (see your host’s Node deployment guide).
5. Run `npm run media:copy-to-disk` once on the server if you ship default `media/` in the repo.

**Where** the variable lives: only in the **environment of the Node process** (`.env` next to `server/index.js`, or your host’s “Environment variables” UI).

---

## 5. One-time copy: repo `media/` → persistent folder

Bundled catalog images live in the git repo under `media/catalog/` (and optionally `media/hero`, etc.). After you set `UPLOADED_MEDIA_ROOT`, run **from the `server/` directory**:

```bash
npm run media:copy-to-disk
```

This copies files from the repo’s default `media/*` trees into `UPLOADED_MEDIA_ROOT` **only when the destination file does not exist** (won’t overwrite uploads).

Requirements: `UPLOADED_MEDIA_ROOT` set; Node 18+.

---

## 6. After images were lost once (DB still has paths)

1. Set `UPLOADED_MEDIA_ROOT` and restart (so new uploads go to the right place).
2. Run `npm run media:copy-to-disk` to restore **anything still present in the repo** under `media/`.
3. For images that **only** existed on an old ephemeral disk, **re-upload** those products in **Vendor → Products** (or restore from your own backup zip into `…/catalog/…` matching the path in the database).

---

## 7. Quick checklist

- [ ] Choose a path that survives reboots and deploys.
- [ ] Set `UPLOADED_MEDIA_ROOT` in **server** environment (Render UI or `server/.env`).
- [ ] Restart server; confirm log line “Persistent media: …”.
- [ ] Run `npm run media:copy-to-disk` once if you rely on repo-shipped `media/` files.
- [ ] Re-upload any vendor images that never existed in git.

For database-only setup reminders, see `server/LOCAL-AND-PROD-DATABASE.md`.
