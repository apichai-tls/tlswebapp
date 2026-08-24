import React from "react";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";
import { ensureReceiptFontsLoaded } from "@/lib/receipt-font-loader";

/**
 * Generate A5 Receipt Image using the EXACT same React component as the Dialog.
 * Uses createRoot to render A5ReceiptContent into an off-screen DOM div so that
 * Tailwind CSS and fonts apply identically to the Dialog captureRef output.
 */
export async function generateA5ReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const [{ createRoot }, { A5ReceiptContent }] = await Promise.all([
    import("react-dom/client"),
    import("@/components/a5-receipt-dialog"),
  ]);

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
    await new Promise((resolve) => {
      root.render(
        React.createElement(A5ReceiptContent, { receiptData, activeShop, currentLanguage: "en" })
      );
      setTimeout(resolve, 0);
    });

    await ensureReceiptFontsLoaded();
    await new Promise((r) => setTimeout(r, 100));

    const target = wrapper.firstElementChild as HTMLElement;
    if (!target) return null;

    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 8000,
    });

    return await new Promise((resolve) =>
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
