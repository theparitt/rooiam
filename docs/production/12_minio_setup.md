# 📦 MinIO (S3 Storage) Setup

This guide covers how to stand up a self-hosted S3-compatible service using **MinIO**. You only need to follow this guide if you are avoiding managed providers like AWS S3 or Cloudflare R2 entirely.

Rooiam uses an S3 bucket to store Tenant-uploaded branding materials (like custom company Logos and User Avatars). 

## 1. Basic Docker Compose Definition

MinIO requires two distinct ports: one for the S3 API processing file uploads, and one for the web Console interface where you can browse the files manually.

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
      # Port 9000 is the S3 Data API
      - "127.0.0.1:9000:9000"
      # Port 9001 is the human Web Console
      - "127.0.0.1:9001:9001"

volumes:
  rooiam_minio_data:
```

### Understanding the Parameters

| Variable | Description |
| :--- | :--- |
| `MINIO_ROOT_USER` | The admin username for the entire MinIO instance. |
| `MINIO_ROOT_PASSWORD` | The admin password. Keep this extremely long and secure. |
| `--console-address ":9001"` | Tells MinIO to serve the human-friendly web UI on port 9001. |

### Networking: Ports 9000 vs 9001
* **Port 9000 (API)**: This is the "Data Port". The Rooiam server talks to this port to upload/download images.
* **Port 9001 (Console)**: This is the "Admin Port". You log in here with your browser to manage buckets.

---

Create strong Root User strings so malicious actors cannot view or delete the user-uploaded avatars. Add these to your `.env.docker.prod`:

```env
MINIO_ROOT_USER=rooiam_admin
MINIO_ROOT_PASSWORD=your_super_secret_minio_password
```

## 3. Initializing the Bucket

Rooiam does not automatically create buckets. You must physically create the S3 bucket intended to store the media *before* the server starts. 

If using MinIO locally via the provided compose stack:
1. Open your browser and navigate to `http://localhost:9001`.
2. Log in using your `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.
3. Click **"Create Bucket"** in the sidebar.
4. Name the bucket (e.g., `rooiam-media`).
5. **CRITICAL:** Go to the bucket settings and change the Access Policy to `Public` (or `Read Only`). If the bucket is Private, then when Rooiam hands out Image URLs to users, the image will show up as a broken link because their browser cannot access it without S3 signing keys!

## 4. Connecting Rooiam to MinIO

Now that the S3 API is answering on port 9000, provide the exact configuration to the Rooiam `.env` file:

```env
ROOIAM_MINIO_ENDPOINT=http://rooiam-minio:9000
ROOIAM_MINIO_USER=rooiam_admin
ROOIAM_MINIO_PASSWORD=your_super_secret_minio_password
ROOIAM_MINIO_BUCKET=rooiam-media
ROOIAM_PUBLIC_MEDIA_BASE=http://localhost:9000/rooiam-media
```

## 5. Moving to Production AWS S3 / R2
If you ever want to abandon MinIO and use AWS S3 or Cloudflare R2, you do not need to rewrite any code. MinIO strictly conforms to the AWS S3 SDK standard.

Just replace the endpoints pointing directly at the Amazon/Cloudflare domains:
```env
ROOIAM_MINIO_ENDPOINT=https://s3.us-east-1.amazonaws.com
ROOIAM_MINIO_USER=AKIA_REAL_AWS_KEY
ROOIAM_MINIO_PASSWORD=your_real_aws_secret
ROOIAM_MINIO_BUCKET=rooiam-production-media
ROOIAM_PUBLIC_MEDIA_BASE=https://rooiam-production-media.s3.amazonaws.com
```
