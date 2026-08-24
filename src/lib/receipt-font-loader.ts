/**
 * receipt-font-loader.ts
 *
 * Fast-path: Inter is loaded by Next.js on page startup, so by the time a user
 * triggers receipt generation, fonts are almost always ready. We check first and
 * skip all waiting. Only falls back to CDN if fonts are genuinely missing.
 */

const FONT_LINK_ID = "__receipt_inter_font_link__";
const PROBE_TEXT = "ABCabc0123฿";

let fontsReady = false; // module-level cache — once ready, always ready

export async function ensureReceiptFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return;

  // Fast-path: already verified in a previous call this session
  if (fontsReady) return;

  // Fast-path: Inter 400 is already in the FontFaceSet (Next.js loaded it)
  if (document.fonts.check("400 14px Inter", PROBE_TEXT)) {
    fontsReady = true;
    return;
  }

  // Fonts not yet ready — trigger lazy load of all weights Next.js registered
  const loadPromises = [400, 500, 600, 700, 900].map((w) =>
    document.fonts.load(`${w} 14px Inter`, PROBE_TEXT).catch(() => {})
  );

  // Also inject Google Fonts as fallback (only once) in case Next.js missed it
  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap";
    document.head.appendChild(link);
  }

  // Wait for font loads, then document.fonts.ready
  await Promise.allSettled(loadPromises);
  if (document.fonts?.ready) await document.fonts.ready;

  // Last-chance wait if still not available (CDN slow / offline)
  if (!document.fonts.check("400 14px Inter", PROBE_TEXT)) {
    await new Promise<void>((r) => setTimeout(r, 300));
  }

  fontsReady = document.fonts.check("400 14px Inter", PROBE_TEXT);
}
