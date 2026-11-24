# Home Hub

Home Hub is a mobile-friendly links and announcements dashboard for a Raspberry Pi or small home server. It uses React + TypeScript + Vite, Tailwind CSS with shadcn UI components (Radix primitives), Express, and SQLite.

## If I forget to dos2unix any scripts (which may happen), please run dos2unix if you're getting any Linux error.

## Features

- Searchable link cards grouped by department, each with an optional **link type** that shows the organisation's logo (GitHub, Google, Microsoft, YouTube, Home Assistant, Plex, Proxmox and ~75 more, auto-detected from the URL). Logos come from [Simple Icons](https://simpleicons.org) (CC0); the Microsoft mark is drawn in-app
- Link and announcement categories with page filters
- Multi-category tags using comma-separated free text
- Optional thumbnail images and downloadable attachments
- Announcements displayed as visual tiles
- Configurable custom API integration cards (weather/stocks/etc.) with JSON path mapping and conditional emoji output
- **Integrations** admin tab with a filterable integration table, full add/edit form with a sticky save bar, and in-place test preview
- Advanced mapper rules with multiple conditions per field (`AND`/`OR`) and condition-specific emoji output
- Integration config import/export as JSON for backup and migration between environments
- Token-safe integration export by default (optional include-tokens checkbox)
- Per-integration visibility: **public** cards show to every visitor, **private** cards only to signed-in users (either role)
- Expandable AI helper section in Integration Setup with a copy-ready markdown template for generating valid import JSON from sample endpoint data
- Integration mapping supports URL/image rendering and unix timestamp conversion (`unix-seconds`)
- Live data viewer uses a carousel with a scrollable integration details panel
- Integration import is validated and applied in a single database transaction. "Add to list" skips invalid entries and reports them; "Replace all" only runs when every entry is valid, so a bad file never wipes your existing integrations
- Unified toast notifications (success, info, and friendly error messages) and confirm-before-delete dialogs
- Responsive layout styling managed with Tailwind utilities and shadcn UI building blocks
- Futuristic visual theme with animated glow orbs, patterned background, and glass-style surfaces
- Customizable site branding including logo and favicon uploads
- Dark and light themes
- Cookie-backed login sessions
- `user` and `admin` roles
- Tabbed **Admin** area (`#/admin/...`, so refresh and the back button keep your place): Site customization, Photos, User management, Integrations
- **Photos** slideshow on the home page with a caption at the bottom; pause button, swipe, arrow keys, and dot navigation. The seconds per photo is set in Admin › Photos › Carousel. Each photo has an **Order** number (lower plays first) that can be typed in or changed with the move arrows. Photos are added by upload (large images are resized to 2048px before upload) or by image URL
- **User management**: add people, reset passwords, change roles, and delete accounts. Role changes and deletions take effect immediately, and a password reset signs that person out on every device
- Admin-managed branding uploads for logo, favicon, and homepage banner image (each can be replaced or removed)
- Home sections (banner, photos, live data, announcements, links) stack top to bottom; each has an **Order** number and an on/off switch in Admin › Site customization. Admins also get a row of show/hide toggles on top of the banner
- Banner with optional heading and text drawn on top of the image (or on a gradient when no image is uploaded)
- Site-wide **font**: pick a popular Google Font from a list or type any Google Fonts family name, with a live preview before saving
- SQLite BLOB storage for photos, link thumbnails, and attachments; images are served from versioned, long-cached URLs
- Link thumbnails and attachments can be replaced or removed when editing a link

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite server proxies `/api` to Express on port `3001`.

On first start, SQLite is created at `data/lil_home_site.sqlite`. The seed creates a Home Hub site, welcome announcement, legacy example links, and an initial admin account:

- Username: `admin`
- Password: `change-me-now`

Change this password after signing in under **Admin › User management** (key icon next to the account). The seed only runs for an empty database.
For production, never keep the default password.

For a custom initial admin:

```bash
ADMIN_USERNAME=your-admin ADMIN_PASSWORD="use-a-long-random-password" npm run server
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express API port |
| `DATA_DIR` | `./data` | Directory containing the SQLite database |
| `JWT_SECRET` | Development fallback | Secret used to sign login cookies; always set a random value in production |
| `NODE_ENV` | unset | Set to `production` to mark login cookies as secure |
| `COOKIE_SECURE` | `NODE_ENV === production` | Override cookie `Secure` flag (`true` for HTTPS, `false` for plain HTTP) |
| `ADMIN_USERNAME` | `admin` | Username used for first-run seeding |
| `ADMIN_PASSWORD` | `change-me-now` | Password used for first-run seeding |

In production (`NODE_ENV=production`), startup fails fast if `JWT_SECRET` is missing or left as the development default.

Generate a secret on Linux:

```bash
openssl rand -hex 32
```

## Raspberry Pi deployment

The following example runs Debian/Raspberry Pi OS. It assumes Node 20+ is available as `node`.

### 1. Install Node.js

Use a supported NodeSource or package-manager setup for the Pi's architecture, then verify:

```bash
node --version
npm --version
```

### 2. Install and build

```bash
sudo mkdir -p /opt/home-hub
sudo chown "$USER":"$USER" /opt/home-hub
git clone https://github.com/000Matvey000/lil_home_site.git /opt/home-hub
cd /opt/home-hub
npm install
npm run build
```

### 3. Create the environment file

Create `/opt/home-hub/.env`:

```bash
PORT=3001
NODE_ENV=production
DATA_DIR=/var/lib/home-hub
JWT_SECRET=<paste-a-random-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<use-a-long-random-password>
```

Create and secure the database directory:

```bash
sudo mkdir -p /var/lib/home-hub
sudo chown "$USER":"$USER" /var/lib/home-hub
```

Load shell variables before starting:

```bash
set -a
. ./.env
set +a
NODE_ENV=production npm start
```

### 4. Run as a systemd service

Create `/etc/systemd/system/home-hub.service`:

```ini
[Unit]
Description=Home Hub
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/home-hub
EnvironmentFile=/opt/home-hub/.env
ExecStart=/usr/bin/npm --prefix /opt/home-hub start
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5
TimeoutStopSec=30
User=pi

[Install]
WantedBy=multi-user.target
```

Update `User=pi`, `WorkingDirectory`, and `/usr/bin/npm` if needed. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now home-hub
sudo systemctl status home-hub
```

Optional keep-alive verification:

```bash
curl -sS http://127.0.0.1:3001/healthz
```

### 5. Configure nginx

Install nginx:

```bash
sudo apt update
sudo apt install nginx
```

Create `/etc/nginx/sites-available/home-hub`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name home-hub.local;

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    keepalive_timeout 65;
    send_timeout 300s;
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/home-hub /etc/nginx/sites-enabled/home-hub
sudo nginx -t
sudo systemctl restart nginx
```

For LAN HTTPS, add a TLS certificate (for example, Caddy or a certificate for a local DNS name). Until HTTPS is enabled, `NODE_ENV=production` also requires the browser to receive secure cookies, so keep the app on local HTTP for initial testing or enable HTTPS.

## SQLite backups

Stop the service or use SQLite's backup API before copying files. A simple consistent backup is:

```bash
sudo systemctl stop home-hub
cp /var/lib/home-hub/lil_home_site.sqlite ~/home-hub-backup.sqlite
sudo systemctl start home-hub
```

## Production updates

```bash
cd /opt/home-hub
git pull
npm install
npm run build
sudo systemctl restart home-hub
```

## Docker deployment

Docker artifacts are in [docker/](/C:/Users/codce/repos/lil_home_site/docker/).

- Setup and usage: [docker/README.md](/C:/Users/codce/repos/lil_home_site/docker/README.md)
- Compose file: [docker/compose.yaml](/C:/Users/codce/repos/lil_home_site/docker/compose.yaml)
- Production compose stack with Caddy HTTPS proxy: [docker/compose.prod.yaml](/C:/Users/codce/repos/lil_home_site/docker/compose.prod.yaml)
- Image build file: [docker/Dockerfile](/C:/Users/codce/repos/lil_home_site/docker/Dockerfile)

For LAN access by IP address on browsers, prefer the Caddy HTTPS stack to avoid browser trust/isolation warnings on plain HTTP.
If your browser starts forcing `https://<host>:3001` for the HTTP stack, clear the HSTS entry for that host and reload `http://<host>:3001`.
`compose.yaml` serves HTTP only; `https://<host>:3001` will fail by design.
