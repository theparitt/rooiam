# 📝 Redis Setup

This guide explicitly covers how to stand up Redis for Rooiam in production.

Rooiam uses Redis strictly for **volatile, fast state**. This includes:
- CSRF tokens
- Short-lived OAuth authorization codes
- Magic-link verification tickets
- IP-based rate limiting counts

Because Redis handles volatile verification tickets, it does not need aggressive disk persistence, but it **does** require low latency.

## 1. Basic Docker Compose Definition

```yaml
services:
  rooiam-redis:
    image: redis:7-alpine
    restart: always
    # We pass the --requirepass flag explicitly to force password authentication
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - rooiam_redis_data:/data
    ports:
      # Only bind to localhost. Do NOT expose Redis port 6379 to the public internet!
      - "127.0.0.1:6379:6379"

volumes:
  rooiam_redis_data:
```

### Understanding the Parameters

| Variable | Description |
| :--- | :--- |
| `REDIS_PASSWORD` | **Critical Security**: The password required to run any command. |
| `--requirepass` | The Redis flag that enables password protection. |
| `--save ""` | Disables periodic snapshots (increases speed, reduces disk writes). |

---

Redis is incredibly fast, which means an exposed passwordless Redis server can be utterly annihilated by a brute-force or malicious injection attack in seconds. **Always use a password.**

Generate a strong password:
```bash
openssl rand -hex 24
```

Add this to your `.env.docker.prod` file:
```env
REDIS_PASSWORD=your_24_character_hex_password
```

## 3. Connecting Rooiam to Redis

Inside the Rooiam server's `.env` configuration, format the `ROOIAM_REDIS_URL` connection string carefully:

```env
# Format: redis://username:password@host:port
# (Redis has no default username in older versions, but the password goes after the colon)
ROOIAM_REDIS_URL=redis://:your_24_character_hex_password@rooiam-redis:6379
```

## 4. Production Adjustments (Disabling Persistence)

Because Rooiam only uses Redis for things that expire within ~10 minutes (like Magic Links), you can safely optimize Redis for speed rather than safe disk backups. 

If you want to prevent Redis from writing enormous `.rdb` files to your disk, you can append `--save ""` to the Docker start command:
```yaml
    command: redis-server --requirepass ${REDIS_PASSWORD} --save "" --appendonly no
```
*Note: Only do this if you are accepting the fact that if the Docker container resets, any active magic links currently in emails will instantly expire and users will have to request a new one.*
