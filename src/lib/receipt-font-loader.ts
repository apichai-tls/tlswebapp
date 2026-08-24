/**
 * receipt-font-loader.ts
 *
 * Ensures the Inter font (loaded by Next.js via next/font/google) is fully
 * available in the browser's FontFaceSet BEFORE html2canvas-pro captures
 * an off-screen DOM element.
 *
 * Strategy:
 *  1. Call document.fonts.load() for each weight to trigger lazy loading
 *     of Inter weights that Next.js has already registered.
 *  2. Inject a Google Fonts <link> as a fallback in case Next.js hasn't
 *     registered the font yet (e.g. first load on slow connection).
 *  3. Wait for document.fonts.ready + a render-frame buffer.
 */

const FONT_LINK_ID = "__receipt_inter_font_link__";

const INTER_WEIGHTS = [400, 500, 600, 700, 900] as const;

// Representative text that exercises common glyphs (Latin + Thai digits)
const PROBE_TEXT = "ABCabc0123฿";

export async function ensureReceiptFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return;

  // --- Step 1: Trigger loading of Inter weights already in FontFaceSet ---
  // Next.js registers Inter via next/font/google but loads lazily.
  // document.fonts.load() forces the browser to fetch & decode now.
  const loadViaFontSet = INTER_WEIGHTS.map((weight) =>
    document.fonts
      .load(`${weight} 14px Inter`, PROBE_TEXT)
      .catch(() => { /* non-fatal */ })
  );

  // --- Step 2: Inject Google Fonts link as fallback (only once) ---
  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=block";
    document.head.appendChild(link);
  }

  // Wait for both the FontFaceSet loads and the document ready state
  await Promise.allSettled(loadViaFontSet);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // --- Step 3: Verify at least weight 400 is available ---
  // If not (CDN blocked, offline, etc.) we still proceed — system font fallback.
  const isLoaded = document.fonts.check(`400 14px Inter`, PROBE_TEXT);
  if (!isLoaded) {
    // Give the fallback CDN link a bit more time
    await new Promise<void>((r) => setTimeout(r, 400));
    await document.fonts.ready;
  }

  // Final render-frame buffer so the browser paints the fonts into the
  // off-screen container BEFORE html2canvas-pro captures it.
  await new Promise<void>((r) => setTimeout(r, 100));
}
