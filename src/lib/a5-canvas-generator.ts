import React from "react";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";
import { ensureReceiptFontsLoaded } from "@/lib/receipt-font-loader";

/**
 * Generate A5 Receipt Image — optimized for speed.
 *
 * Key optimizations:
 *  1. All 3 heavy imports (react-dom, component, html2canvas) run in parallel
 *  2. Font check uses module-level fast-path (near-instant on 2nd+ calls)
 *  3. React render + font loading run concurrently
 *  4. Uses double-rAF instead of setTimeout(100) for tighter layout sync
 */
export async function generateA5ReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  // Kick off ALL heavy imports in parallel immediately
  const [{ createRoot }, { A5ReceiptContent }, html2canvasMod] = await Promise.all([
    import("react-dom/client"),
    import("@/components/a5-receipt-dialog"),
    import("html2canvas-pro"),
  ]);
  const html2canvas = html2canvasMod.default;

  // Kick off font check concurrently with DOM setup
  const fontReadyPromise = ensureReceiptFontsLoaded();

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "0";
  wrapper.style.zIndex = "-99999";
  wrapper.style.opacity = "0.01";
  wrapper.style.pointerEvents = "none";
  wrapper.style.width = "559px";
  document.body.appendChild(wrapper);

  const root = createRoot(wrapper);

  try {
    // Run React render and font loading concurrently
    await Promise.all([
      // Double-rAF: wait for 2 animation frames so React layout is fully committed
      new Promise<void>((resolve) => {
        root.render(
          React.createElement(A5ReceiptContent, { receiptData, activeShop, currentLanguage: "en" })
        );
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
      fontReadyPromise,
    ]);

    const target = wrapper.firstElementChild as HTMLElement;
    if (!target) return null;

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 8000,
    });

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
  } catch (err) {
    console.error("A5 receipt capture failed:", err);
    return null;
  } finally {
    root.unmount();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }
}
