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

> Run either `compose.yaml` (HTTP) or `compose.prod.yaml` (Caddy HTTPS), not both at the same time.

## What setup scripts do

1. Copy `docker/.env.example` to `docker/.env` if missing
2. Generate a random `JWT_SECRET` if still using placeholder value

## Useful commands

```bash
docker compose -f docker/compose.yaml ps
docker compose -f docker/compose.yaml logs -f
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml down -v # Remove volumes as well
docker compose -f docker/compose.prod.yaml ps
docker compose -f docker/compose.prod.yaml logs -f caddy
docker compose -f docker/compose.prod.yaml logs -f home-hub
docker compose -f docker/compose.prod.yaml down -v # Remove volumes as well
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
- Persistent database:
  - `compose.yaml`: Docker named volume `home_hub_data`
  - `compose.prod.yaml`: Docker named volume `home_hub_data`
- Caddy manages HTTPS certificates. Current default uses `tls internal` for LAN/self-managed trust.
- Production compose uses Docker named volumes (`home_hub_data`, `caddy_data`, `caddy_config`) to avoid host filesystem locking issues with SQLite.

### Trusted HTTPS notes for home network

- Default (`tls internal`) works immediately, but browsers/devices must trust Caddy's internal root CA.
- For publicly trusted certs, set `CADDY_HOST` to a real DNS name and update [Caddyfile](./caddy/Caddyfile) to use ACME (remove `tls internal`).

## Production volume management

Inspect production volumes:

```bash
docker volume ls | grep -E "home_hub_data|caddy_data|caddy_config"
```

PowerShell equivalent:

```powershell
docker volume ls | Select-String "home_hub_data|caddy_data|caddy_config"
```

Back up SQLite from the named volume:

```bash
docker run --rm -v docker_home_hub_data:/from -v "$PWD":/to alpine cp /from/lil_home_site.sqlite /to/home-hub-backup.sqlite
```

PowerShell equivalent:

```powershell
docker run --rm -v docker_home_hub_data:/from -v "${PWD}:/to" alpine cp /from/lil_home_site.sqlite /to/home-hub-backup.sqlite
```

## Troubleshooting

- If `home-hub` is unhealthy, check logs:
  - `docker compose -f docker/compose.yaml logs -f home-hub`
  - `docker compose -f docker/compose.prod.yaml logs -f home-hub`
- If ports are already in use (80/443/3001), stop old stacks or change `PORT`, `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT` in `docker/.env`.
- If HTTPS warns as untrusted on LAN, that is expected with `tls internal` until client devices trust Caddy's internal root CA.
