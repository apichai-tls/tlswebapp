import React from "react";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";
import { ensureReceiptFontsLoaded } from "@/lib/receipt-font-loader";

let a5RenderQueue: Promise<unknown> = Promise.resolve();
const recentOrInFlightCaptures = new Map<string, number>();

export function markReceiptCaptureStarted(filename: string): boolean {
  if (!filename) return true;
  const now = Date.now();
  const last = recentOrInFlightCaptures.get(filename);
  if (last && now - last < 15000) {
    return false;
  }
  recentOrInFlightCaptures.set(filename, now);
  return true;
}

export function clearReceiptCaptureLock(filename: string): void {
  if (!filename) return;
  recentOrInFlightCaptures.delete(filename);
}

/**
 * Generate A5 Receipt Image — optimized for speed & serialized via render queue
 * so concurrent Proforma (INV) + Receipt (REC) captures never collide on document.body.
 *
 * Key optimizations:
 *  1. All 3 heavy imports (react-dom, component, html2canvas) run in parallel
 *  2. Font check uses module-level fast-path (near-instant on 2nd+ calls)
 *  3. React render + font loading run concurrently
 *  4. Uses double-rAF instead of setTimeout(100) for tighter layout sync
 *  5. Mutex queue prevents concurrent html2canvas DOM cloning collisions
 */
export function generateA5ReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  const next = a5RenderQueue.then(
    () => generateA5ReceiptImageInternal(receiptData, activeShop),
    () => generateA5ReceiptImageInternal(receiptData, activeShop)
  );
  a5RenderQueue = next.catch(() => {});
  return next;
}

async function generateA5ReceiptImageInternal(
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
  wrapper.style.height = "793px";
  wrapper.style.overflow = "hidden";
  wrapper.style.backgroundColor = "#ffffff";
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
      width: 559,
      height: 793,
      windowWidth: 559,
      windowHeight: 793,
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
