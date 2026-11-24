/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost).
 * Home Hub is often opened over plain HTTP on the LAN (e.g. the Docker
 * compose.yaml profile at http://<pi-ip>:3001), where the async Clipboard API
 * is undefined, so we fall back to the legacy execCommand("copy") path.
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied or document not focused: try the legacy path below.
    }
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    previousFocus?.focus?.();
  }
  if (!copied) throw new Error("Copy to clipboard is not available in this browser");
}

/** Select the contents of an element so the user can press Ctrl/Cmd+C. */
export function selectElementText(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
