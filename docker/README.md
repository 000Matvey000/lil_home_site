# Home Hub Docker deployment

This folder contains a production Docker setup for Home Hub.

## Files

- `Dockerfile` - Builds the app and runs Express on port `3001`
- `compose.yaml` - Runs Home Hub with persistent SQLite storage and health checks
- `compose.prod.yaml` - Production stack with Caddy reverse proxy and HTTPS support
- `.env.example` - Environment template for Docker Compose
- `scripts/setup.sh` - Linux/macOS setup helper
- `scripts/setup.ps1` - Windows PowerShell setup helper
- `caddy/Caddyfile` - Caddy reverse-proxy + TLS configuration

## Quick start

From the repository root:

### Linux/macOS

```bash
sh docker/scripts/setup.sh
docker compose -f docker/compose.yaml up -d --build
```

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\scripts\setup.ps1
docker compose -f .\docker\compose.yaml up -d --build
```

Open: `http://localhost:3001`

## Production profile (Caddy reverse proxy + HTTPS)

### Linux/macOS

```bash
sh docker/scripts/setup.sh
docker compose -f docker/compose.prod.yaml up -d --build
```

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\scripts\setup.ps1
docker compose -f .\docker\compose.prod.yaml up -d --build
```

Open: `https://localhost` (or `https://localhost:${CADDY_HTTPS_PORT}` if you changed it)

## What setup scripts do

1. Copy `docker/.env.example` to `docker/.env` if missing
2. Generate a random `JWT_SECRET` if still using placeholder value
3. Ensure host `data/` folder exists for SQLite persistence

## Useful commands

```bash
docker compose -f docker/compose.yaml ps
docker compose -f docker/compose.yaml logs -f
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml down -v
docker compose -f docker/compose.prod.yaml ps
docker compose -f docker/compose.prod.yaml logs -f caddy
docker compose -f docker/compose.prod.yaml down
```

## Environment variables (`docker/.env`)

- `PORT` (default `3001`)
- `CADDY_HTTP_PORT` (default `80`)
- `CADDY_HTTPS_PORT` (default `443`)
- `CADDY_HOST` (default `localhost`; set to your LAN DNS name if available)
- `JWT_SECRET` (required in production; setup script auto-generates)
- `ADMIN_USERNAME` (default `admin`)
- `ADMIN_PASSWORD` (default `change-me-now`, change immediately)

## Keep-alive/reliability behavior

- Compose restart policy: `unless-stopped`
- Container health check: `GET /healthz` every 30s
- Persistent database: host `data/` mounted to `/app/data`
- Caddy manages HTTPS certificates. Current default uses `tls internal` for LAN/self-managed trust.

### Trusted HTTPS notes for home network

- Default (`tls internal`) works immediately, but browsers/devices must trust Caddy's internal root CA.
- For publicly trusted certs, set `CADDY_HOST` to a real DNS name and update [Caddyfile](./caddy/Caddyfile) to use ACME (remove `tls internal`).

