/**
 * receipt-font-loader.ts
 *
 * Injects Google Fonts @font-face declarations directly into the document
 * and forces the browser to load the exact font weights used by receipt
 * components BEFORE html2canvas-pro captures the off-screen DOM.
 *
 * This guarantees that background-generated receipt images use the same
 * Inter font as the Dialog preview (which benefits from Next.js font
 * pre-loading via next/font/google).
 */

const FONT_STYLE_ID = "__receipt_font_face_injected__";

/**
 * Injects the Google Fonts stylesheet once into <head> and waits until
 * the Inter font is fully loaded by the browser before resolving.
 */
export async function ensureReceiptFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return;

  // Inject <link> to Google Fonts only once per page session
  if (!document.getElementById(FONT_STYLE_ID)) {
    const link = document.createElement("link");
    link.id = FONT_STYLE_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap";
    document.head.appendChild(link);

    // Give the link time to start loading
    await new Promise<void>((r) => setTimeout(r, 50));
  }

  // Force-load each weight explicitly using the FontFace API
  // so the browser pre-fetches the .woff2 files now, not lazily
  const weights = [400, 500, 600, 700, 900] as const;
  const loadPromises: Promise<void>[] = [];

  for (const weight of weights) {
    try {
      if (!document.fonts.check(`${weight} 12px Inter`, "ABCabc")) {
        const fontFace = new FontFace(
          "Inter",
          "url(https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2) format('woff2')",
          { weight: String(weight), style: "normal", display: "swap" }
        );
        loadPromises.push(
          fontFace.load().then((loaded) => {
            document.fonts.add(loaded);
          }).catch(() => { /* non-fatal */ })
        );
      }
    } catch { /* FontFace API unavailable */ }
  }

  if (loadPromises.length > 0) {
    await Promise.allSettled(loadPromises);
  }

  // Wait for ALL fonts in document FontFaceSet to be ready
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Extra render-frame buffer so the browser has painted the fonts
  // into the off-screen container before html2canvas captures it
  await new Promise<void>((r) => setTimeout(r, 200));
}

