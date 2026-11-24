import {
  siAdguard, siAirbnb, siApple, siApplemusic, siBitbucket, siBitwarden, siBluesky, siClaude, siCloudflare, siDigitalocean,
  siDiscord, siDocker, siDropbox, siDuckduckgo, siDuolingo, siEbay, siEtsy, siFacebook, siFigma, siGitea, siGithub, siGitlab,
  siGmail, siGoogle, siGooglecalendar, siGoogledocs, siGoogledrive, siGooglemaps, siGooglephotos, siGooglesheets, siGrafana,
  siHomeassistant, siHubspot, siIcloud, siImmich, siInstagram, siJellyfin, siJira, siMastodon, siNetflix, siNextcloud,
  siNotion, siObsidian, siOpenmediavault, siPaypal, siPihole, siPinterest, siPlex, siPortainer, siProxmox, siRaspberrypi,
  siReddit, siSignal, siSpotify, siStackoverflow, siSteam, siSynology, siTailscale, siTelegram, siThreads, siTiktok,
  siTodoist, siTrello, siTruenas, siTwitch, siUbiquiti, siUnraid, siVaultwarden, siVimeo, siWhatsapp, siWikipedia,
  siWordpress, siX, siYoutube, siYoutubemusic, siZoom,
} from "simple-icons";

export type BrandGroup = "popular" | "more" | "homelab";
export type Brand = {
  /** Stored on the link as link_type. Never rename an existing key. */
  key: string;
  title: string;
  /** Brand colour without "#". */
  hex: string;
  /** 24×24 SVG path (Simple Icons, CC0). Absent for hand-drawn marks. */
  path?: string;
  /** Hostnames (optionally with a path prefix, e.g. "google.com/maps") used to auto-detect the brand from a URL. */
  domains: string[];
  /** Default ports of self-hosted apps, used when the URL is a bare IP. */
  ports?: number[];
  group: BrandGroup;
};

type SimpleIcon = { title: string; hex: string; path: string };
const icon = (si: SimpleIcon, key: string, group: BrandGroup, domains: string[], ports?: number[]): Brand => ({
  key, title: si.title, hex: si.hex, path: si.path, group, domains, ports,
});

/**
 * Logos offered for links. Simple Icons doesn't ship some brands (Microsoft,
 * Slack, LinkedIn, Amazon...) at those companies' request; Microsoft is drawn
 * by hand below because its mark is plain geometry.
 */
export const BRANDS: Brand[] = [
  icon(siGithub, "github", "popular", ["github.com"]),
  icon(siGoogle, "google", "popular", ["google.com"]),
  { key: "microsoft", title: "Microsoft", hex: "0078D4", group: "popular", domains: ["microsoft.com", "office.com", "microsoft365.com", "live.com", "outlook.com", "sharepoint.com", "onedrive.com", "xbox.com"] },
  icon(siApple, "apple", "popular", ["apple.com"]),
  icon(siYoutube, "youtube", "popular", ["youtube.com", "youtu.be"]),
  icon(siFacebook, "facebook", "popular", ["facebook.com", "fb.com", "messenger.com"]),
  icon(siInstagram, "instagram", "popular", ["instagram.com"]),
  icon(siX, "x", "popular", ["x.com", "twitter.com"]),
  icon(siReddit, "reddit", "popular", ["reddit.com"]),
  icon(siDiscord, "discord", "popular", ["discord.com", "discord.gg"]),
  icon(siWhatsapp, "whatsapp", "popular", ["whatsapp.com", "wa.me"]),
  icon(siNetflix, "netflix", "popular", ["netflix.com"]),
  icon(siSpotify, "spotify", "popular", ["spotify.com"]),
  icon(siWikipedia, "wikipedia", "popular", ["wikipedia.org"]),
  icon(siGmail, "gmail", "popular", ["mail.google.com", "gmail.com"]),
  icon(siGoogledrive, "googledrive", "popular", ["drive.google.com"]),
  icon(siGooglecalendar, "googlecalendar", "popular", ["calendar.google.com"]),
  icon(siDropbox, "dropbox", "popular", ["dropbox.com"]),
  icon(siNotion, "notion", "popular", ["notion.so", "notion.com"]),
  icon(siFigma, "figma", "popular", ["figma.com"]),
  icon(siZoom, "zoom", "popular", ["zoom.us", "zoom.com"]),
  icon(siPaypal, "paypal", "popular", ["paypal.com"]),
  icon(siTwitch, "twitch", "popular", ["twitch.tv"]),
  icon(siSteam, "steam", "popular", ["steampowered.com", "steamcommunity.com"]),

  icon(siGooglemaps, "googlemaps", "more", ["maps.google.com", "google.com/maps", "maps.app.goo.gl"]),
  icon(siGooglephotos, "googlephotos", "more", ["photos.google.com"]),
  icon(siGoogledocs, "googledocs", "more", ["docs.google.com/document"]),
  icon(siGooglesheets, "googlesheets", "more", ["docs.google.com/spreadsheets", "sheets.google.com"]),
  icon(siYoutubemusic, "youtubemusic", "more", ["music.youtube.com"]),
  icon(siApplemusic, "applemusic", "more", ["music.apple.com"]),
  icon(siIcloud, "icloud", "more", ["icloud.com"]),
  icon(siGitlab, "gitlab", "more", ["gitlab.com"]),
  icon(siBitbucket, "bitbucket", "more", ["bitbucket.org"]),
  icon(siStackoverflow, "stackoverflow", "more", ["stackoverflow.com"]),
  icon(siTelegram, "telegram", "more", ["telegram.org", "t.me"]),
  icon(siSignal, "signal", "more", ["signal.org"]),
  icon(siMastodon, "mastodon", "more", ["mastodon.social", "joinmastodon.org"]),
  icon(siBluesky, "bluesky", "more", ["bsky.app", "bsky.social"]),
  icon(siThreads, "threads", "more", ["threads.net", "threads.com"]),
  icon(siTiktok, "tiktok", "more", ["tiktok.com"]),
  icon(siPinterest, "pinterest", "more", ["pinterest.com"]),
  icon(siVimeo, "vimeo", "more", ["vimeo.com"]),
  icon(siTrello, "trello", "more", ["trello.com"]),
  icon(siJira, "jira", "more", ["atlassian.net", "jira.com"]),
  icon(siTodoist, "todoist", "more", ["todoist.com"]),
  icon(siObsidian, "obsidian", "more", ["obsidian.md"]),
  icon(siHubspot, "hubspot", "more", ["hubspot.com"]),
  icon(siWordpress, "wordpress", "more", ["wordpress.com", "wordpress.org"]),
  icon(siDigitalocean, "digitalocean", "more", ["digitalocean.com"]),
  icon(siClaude, "claude", "more", ["claude.ai"]),
  icon(siDuckduckgo, "duckduckgo", "more", ["duckduckgo.com"]),
  icon(siEbay, "ebay", "more", ["ebay.com"]),
  icon(siEtsy, "etsy", "more", ["etsy.com"]),
  icon(siAirbnb, "airbnb", "more", ["airbnb.com"]),
  icon(siDuolingo, "duolingo", "more", ["duolingo.com"]),

  icon(siHomeassistant, "homeassistant", "homelab", ["home-assistant.io", "homeassistant.local", "nabu.casa"], [8123]),
  icon(siPlex, "plex", "homelab", ["plex.tv"], [32400]),
  icon(siJellyfin, "jellyfin", "homelab", ["jellyfin.org"], [8096]),
  icon(siProxmox, "proxmox", "homelab", ["proxmox.com"], [8006]),
  icon(siRaspberrypi, "raspberrypi", "homelab", ["raspberrypi.com", "raspberrypi.org"]),
  icon(siNextcloud, "nextcloud", "homelab", ["nextcloud.com"]),
  icon(siImmich, "immich", "homelab", ["immich.app"], [2283]),
  icon(siSynology, "synology", "homelab", ["synology.com", "quickconnect.to"]),
  icon(siTruenas, "truenas", "homelab", ["truenas.com"]),
  icon(siUnraid, "unraid", "homelab", ["unraid.net"]),
  icon(siOpenmediavault, "openmediavault", "homelab", ["openmediavault.org"]),
  icon(siPihole, "pihole", "homelab", ["pi.hole", "pi-hole.net"]),
  icon(siAdguard, "adguard", "homelab", ["adguard.com"]),
  icon(siUbiquiti, "ubiquiti", "homelab", ["ui.com"]),
  icon(siCloudflare, "cloudflare", "homelab", ["cloudflare.com"]),
  icon(siTailscale, "tailscale", "homelab", ["tailscale.com"]),
  icon(siDocker, "docker", "homelab", ["docker.com"]),
  icon(siPortainer, "portainer", "homelab", ["portainer.io"], [9443]),
  icon(siGrafana, "grafana", "homelab", ["grafana.com"]),
  icon(siGitea, "gitea", "homelab", ["gitea.com", "gitea.io"]),
  icon(siBitwarden, "bitwarden", "homelab", ["bitwarden.com"]),
  icon(siVaultwarden, "vaultwarden", "homelab", []),
];

export const BRAND_GROUPS: Array<{ key: BrandGroup; label: string }> = [
  { key: "popular", label: "Popular" },
  { key: "more", label: "More services" },
  { key: "homelab", label: "Home lab & self-hosted" },
];

const BY_KEY = new Map(BRANDS.map((brand) => [brand.key, brand]));
export const getBrand = (key: string | undefined) => (key ? BY_KEY.get(key) : undefined);

/** Best-matching brand for a URL: the most specific domain wins; known app ports are a weak fallback. */
export function detectBrand(rawUrl: string): Brand | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let best: Brand | undefined;
  let bestScore = 0;
  for (const brand of BRANDS) {
    for (const domain of brand.domains) {
      const [domainHost, ...rest] = domain.split("/");
      const pathPrefix = rest.length ? `/${rest.join("/")}` : "";
      const hostMatches = host === domainHost || host.endsWith(`.${domainHost}`);
      if (hostMatches && url.pathname.startsWith(pathPrefix) && domain.length > bestScore) {
        best = brand;
        bestScore = domain.length;
      }
    }
  }
  if (best) return best;
  const port = Number(url.port);
  return port ? BRANDS.find((brand) => brand.ports?.includes(port)) : undefined;
}

/** The brand's logo as an inline SVG, coloured via `currentColor` (except Microsoft's four colours). */
export function BrandIcon({ brand, size = 20, className }: { brand: Brand; size?: number; className?: string }) {
  if (brand.key === "microsoft") {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1.5" y="1.5" width="10" height="10" fill="#F25022" />
        <rect x="12.5" y="1.5" width="10" height="10" fill="#7FBA00" />
        <rect x="1.5" y="12.5" width="10" height="10" fill="#00A4EF" />
        <rect x="12.5" y="12.5" width="10" height="10" fill="#FFB900" />
      </svg>
    );
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={brand.path} />
    </svg>
  );
}

/** Inline style that exposes the brand colour as --brand for CSS. */
export const brandStyle = (brand: Brand) => ({ "--brand": `#${brand.hex}` }) as React.CSSProperties;
