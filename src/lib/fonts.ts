export type FontOption = { name: string; category: "sans" | "serif" | "display" };

/** Popular Google Fonts offered in the picker. Any other family can be typed in. */
export const POPULAR_FONTS: FontOption[] = [
  { name: "Inter", category: "sans" },
  { name: "Roboto", category: "sans" },
  { name: "Open Sans", category: "sans" },
  { name: "Lato", category: "sans" },
  { name: "Montserrat", category: "sans" },
  { name: "Poppins", category: "sans" },
  { name: "Nunito", category: "sans" },
  { name: "Raleway", category: "sans" },
  { name: "Source Sans 3", category: "sans" },
  { name: "Work Sans", category: "sans" },
  { name: "DM Sans", category: "sans" },
  { name: "Manrope", category: "sans" },
  { name: "Outfit", category: "sans" },
  { name: "Plus Jakarta Sans", category: "sans" },
  { name: "IBM Plex Sans", category: "sans" },
  { name: "Rubik", category: "sans" },
  { name: "Noto Sans", category: "sans" },
  { name: "Fira Sans", category: "sans" },
  { name: "Ubuntu", category: "sans" },
  { name: "Quicksand", category: "display" },
  { name: "Space Grotesk", category: "display" },
  { name: "Josefin Sans", category: "display" },
  { name: "Merriweather", category: "serif" },
  { name: "Lora", category: "serif" },
  { name: "Playfair Display", category: "serif" },
  { name: "Roboto Slab", category: "serif" },
  { name: "Libre Baskerville", category: "serif" },
];

const FALLBACKS = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
};

/** Same rule the server enforces: letters, digits and spaces only. */
export function isValidFontName(name: string) {
  return /^[A-Za-z0-9 ]{1,60}$/.test(name.trim());
}

/** A full CSS font-family stack for a Google Fonts family name. */
export function fontStack(name: string) {
  const category = POPULAR_FONTS.find((font) => font.name === name)?.category;
  return `"${name}", ${category === "serif" ? FALLBACKS.serif : FALLBACKS.sans}`;
}

function stylesheetUrl(name: string, weights: string) {
  const family = encodeURIComponent(name.trim()).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}${weights ? `:wght@${weights}` : ""}&display=swap`;
}

/**
 * Load a Google Fonts family into a <link id={slot}>. Google rejects the whole
 * request if any requested weight is missing, so we try the full set first,
 * then fewer weights, then the family's default. Resolves false if Google has
 * no font by that name.
 */
export function loadGoogleFont(name: string, slot: string): Promise<boolean> {
  const attempts = ["400;500;600;700", "400;700", ""];
  return new Promise((resolve) => {
    let link = document.getElementById(slot) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = slot;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    const node = link;
    const tryNext = (index: number) => {
      if (index >= attempts.length) return resolve(false);
      node.onload = () => resolve(true);
      node.onerror = () => tryNext(index + 1);
      node.href = stylesheetUrl(name, attempts[index]);
    };
    tryNext(0);
  });
}

/** Apply the site-wide font ("" restores the built-in system stack). */
export function applySiteFont(name: string) {
  const root = document.documentElement;
  if (!name || !isValidFontName(name)) {
    root.style.removeProperty("--app-font");
    document.getElementById("site-font")?.remove();
    return;
  }
  root.style.setProperty("--app-font", fontStack(name));
  void loadGoogleFont(name, "site-font");
}
