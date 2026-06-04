# 📦 MinIO (S3 Storage) Setup

This guide covers how to stand up a self-hosted S3-compatible service using **MinIO**. You only need to follow this guide if you are avoiding managed providers like AWS S3 or Cloudflare R2 entirely.

Rooiam uses an S3 bucket to store tenant-uploaded branding materials (company logos, login-widget logos) and user avatars. These are **public assets** — they appear on login pages, so the browser must be able to fetch them anonymously.

> **The mental model.** Rooiam *writes* to MinIO using your secret keys, but the *browser reads* the images with no credentials at all. So two things must be true: the bucket must allow **anonymous read**, and the image URL Rooiam hands out must be reachable by the browser. Most setup problems come from one of those two not holding.

## 1. Basic Docker Compose Definition

MinIO needs two ports: the **S3 API** (uploads/downloads) and the **web Console** (manual browsing).

```yaml
services:
  rooiam-minio:
    image: minio/minio:latest
    restart: always
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    volumes:
      - rooiam_minio_data:/data
    ports:
      # Port 9000 is the S3 Data API — the server AND your reverse proxy use this.
      - "127.0.0.1:9000:9000"
      # Port 9001 is the human Web Console.
      - "127.0.0.1:9001:9001"

volumes:
  rooiam_minio_data:
```

### Networking: Ports 9000 vs 9001
* **Port 9000 (API)** — the "Data Port". The Rooiam server uploads here, and your reverse proxy serves browser image requests from here.
* **Port 9001 (Console)** — the "Admin Port". Log in with your browser to manage buckets.

> **Binding to `127.0.0.1`** keeps MinIO off the public internet. Your reverse proxy (which *is* allowed to reach `127.0.0.1`) handles public access — see §5. If MinIO runs on a **different host** than the server/proxy, bind it to that host's LAN IP and point everything at that IP:port instead of `localhost`.

## 2. Credentials

Pick strong root credentials and put them in your `.env.docker.public.prod`:

```env
MINIO_ROOT_USER=rooiam_admin
MINIO_ROOT_PASSWORD=your_super_secret_minio_password
```

| Variable | Description |
| :--- | :--- |
| `MINIO_ROOT_USER` | Admin username for the MinIO instance. |
| `MINIO_ROOT_PASSWORD` | Admin password. Keep it long and secret. |

## 3. Create the Bucket

Rooiam does **not** create buckets automatically — create it before first use.

1. Open the console (`http://localhost:9001`, or `http://<minio-host>:9001`) and log in with the root credentials.
2. **Create Bucket** → name it (e.g. `rooiam`).

You do **not** need to manually set the access policy here — Rooiam sets it for you (see §4). If you prefer to do it by hand, see [§6 Make the bucket public-read](#6-make-the-bucket-public-read).

## 4. Connect Rooiam to MinIO (and let it self-configure)

Set these in your `.env.docker.public.prod`:

```env
ROOIAM_MINIO_ENDPOINT=http://rooiam-minio:9000   # how the SERVER reaches MinIO (docker service name, or LAN IP:port)
ROOIAM_MINIO_USER=rooiam_admin
ROOIAM_MINIO_PASSWORD=your_super_secret_minio_password
ROOIAM_MINIO_BUCKET=rooiam
ROOIAM_PUBLIC_MEDIA_BASE=https://api.example.com/media   # the PUBLIC URL prefix the BROWSER uses — see §5
```

> ⚠️ **`ROOIAM_PUBLIC_MEDIA_BASE` is a browser-facing URL, not a server address.** It must be a URL a user's browser can reach. With a reverse proxy in front (§5), set it to `https://<your-api-domain>/media`. It accepts either a full URL (`https://api.example.com/media`) or a bare path (`/media`); both are kept as-is. **Do not** use `http://localhost:9000/...` here in production — browsers can't reach localhost.

Then, in the **admin console → Platform → Settings → Storage** tab:

1. Select **MinIO**, fill in endpoint / bucket / access key / secret.
2. Click **Test & Save**.

Test & Save runs a real **round-trip** before saving: it uploads a probe object, reads it back **anonymously** (exactly like a browser), and deletes it — and it **automatically sets the bucket to public-read** in the process. If any step fails, it tells you exactly what and where (`[WRITE FAILED] cannot reach host …`, `[READ FAILED] … 403 — bucket not public-read`, etc.) and **refuses to save** a broken config. A green "Round-trip OK" means uploaded images will actually be visible.

## 5. Serve `/media` through your reverse proxy

The browser fetches images from `ROOIAM_PUBLIC_MEDIA_BASE` (e.g. `https://api.example.com/media/...`). Your reverse proxy must route that path to MinIO's S3 API, stripping `/media` and prepending the bucket name.

**Caddy** (this is what Rooiam's reference deploy uses):

```caddy
api.example.com {
    tls /etc/caddy/certs/your-origin.pem /etc/caddy/certs/your-origin.key

    # Serve uploaded media straight from the MinIO bucket.
    # /media/uploads/x.png  ->  <minio>/<bucket>/uploads/x.png
    handle_path /media/* {
        rewrite * /rooiam{uri}          # /rooiam = your bucket name
        reverse_proxy 127.0.0.1:9000    # MinIO S3 API (use the LAN IP:port if MinIO is on another host)
    }

    # Everything else -> the Rooiam API
    reverse_proxy 127.0.0.1:5170
}
```

The `handle_path /media/*` block **must come before** the catch-all `reverse_proxy` to the API, or `/media` requests fall through to the API and 404.

**nginx** equivalent:

```nginx
location /media/ {
    rewrite ^/media/(.*)$ /rooiam/$1 break;   # /rooiam = bucket name
    proxy_pass http://127.0.0.1:9000;
}
```

> **If a CDN (e.g. Cloudflare) sits in front**, it may cache responses — including a 404 from before things were configured. After fixing the proxy, purge the CDN cache for `/media/*` (or test with a `?v=123` cache-buster) so you're not chasing a stale 404.

## 6. Make the bucket public-read

Test & Save (§4) does this automatically. To do it manually — or to verify — use `mc`:

```bash
# inside the MinIO container (localhost = MinIO itself):
docker compose exec rooiam-minio sh -c \
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" \
   && mc anonymous set download local/rooiam'
```

This grants anonymous `s3:GetObject` only — no listing, uploads, or deletes.

> **The console "Access: PRIVATE" badge can lie.** `mc anonymous set download` sets an *anonymous access policy* that the console summary badge doesn't always reflect. Don't trust the badge — verify with an actual anonymous read (next).

### Verify

```bash
# A MISSING key on a PUBLIC bucket returns 404 NoSuchKey.
# A 403 AccessDenied means the bucket is still PRIVATE.
curl -I http://<minio-host>:9000/rooiam/does-not-exist.png      # expect 404 NoSuchKey
curl -I https://api.example.com/media/<a-real-uploaded-key>     # expect 200
```

## 7. Moving to AWS S3 / Cloudflare R2

MinIO is S3-compatible, so no code changes are needed — just point the config at the managed endpoint and make the bucket/objects publicly readable there:

```env
ROOIAM_MINIO_ENDPOINT=https://s3.us-east-1.amazonaws.com
ROOIAM_MINIO_USER=AKIA_REAL_AWS_KEY
ROOIAM_MINIO_PASSWORD=your_real_aws_secret
ROOIAM_MINIO_BUCKET=rooiam-production-media
ROOIAM_PUBLIC_MEDIA_BASE=https://rooiam-production-media.s3.amazonaws.com
```

With a managed provider the bucket is usually reachable on its own public domain, so you can point `ROOIAM_PUBLIC_MEDIA_BASE` straight at it and skip the §5 reverse-proxy step.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Image URL is doubled (`https://host/https://host/media/…`) | Old bug where a full-URL `ROOIAM_PUBLIC_MEDIA_BASE` was mangled. | Update the server (fixed); full URLs are now kept verbatim. |
| `403 AccessDenied` on the image | Bucket is private. | §6 — set public-read (or re-run Test & Save). |
| `404 NoSuchKey` via the public URL | Reverse proxy points at the wrong bucket/endpoint, or the file isn't in *this* MinIO. | Check the §5 `rewrite` bucket name and that the server uploads to the same MinIO the proxy reads from. |
| `/media` returns the API's 404 (CSP headers, not MinIO) | The `handle_path /media/*` block is missing or after the catch-all. | §5 — add it before `reverse_proxy …:5170` and reload the proxy. |
| Browser still 404s after a fix | CDN cached the old 404. | Purge the CDN cache for `/media/*`. |
| Test & Save fails | The error names the step (`[WRITE FAILED]` / `[READ FAILED]` / `[DELETE FAILED]`). | Follow the message — host unreachable, bad keys, bucket missing, or not public-read. |
