/**
 * receipt-font-loader.ts
 *
 * Fast-path: Inter and Prompt are loaded for crisp typography in both
 * English and Thai, ensuring proper rendering without font distortion.
 */

const FONT_LINK_ID = "__receipt_font_link__";
const PROBE_TEXT = "ABCabc0123฿กขคงอัมพุช";

let fontsReady = false;

export async function ensureReceiptFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return;

  if (fontsReady && document.fonts.check("400 14px Prompt", PROBE_TEXT)) return;

  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Prompt:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  const loadPromises = [
    ...[400, 500, 600, 700, 900].map((w) =>
      document.fonts.load(`${w} 14px Inter`, PROBE_TEXT).catch(() => {})
    ),
    ...[400, 500, 600, 700].map((w) =>
      document.fonts.load(`${w} 14px Prompt`, PROBE_TEXT).catch(() => {})
    ),
  ];

  await Promise.allSettled(loadPromises);
  if (document.fonts?.ready) await document.fonts.ready;

  fontsReady = document.fonts.check("400 14px Prompt", PROBE_TEXT);
}
