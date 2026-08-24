import { format } from "date-fns";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";

function formatCurrency(val: number): string {
  return (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cleanRemarkForDisplay(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .split("|")
    .map(p => p.trim())
    .filter(p => !p.startsWith("Proforma:") && !p.startsWith("Revision:") && !p.startsWith("VAT:") && !p.startsWith("VAT ["))
    .join(" | ")
    .trim();
}

/**
 * Generate Thermal Receipt Image using Method 1 (HTML DOM + html2canvas-pro)
 * Guarantees 100% identical styling, logo, fonts, and layout.
 */
export async function generateThermalReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-99999";
  container.style.opacity = "0.01";
  container.style.pointerEvents = "none";
  container.style.width = "280px";

  const safeCreatedAt = receiptData.createdAt 
    ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt))
    : new Date();
  const validCreatedAt = isNaN(safeCreatedAt.getTime()) ? new Date() : safeCreatedAt;
  const formattedDate = format(validCreatedAt, "dd/MM/yyyy HH:mm");

  const subtotalVal = receiptData.subtotal + receiptData.expressSurcharge + (receiptData.deliveryFee || 0) - receiptData.discount;
  const cleanRemark = cleanRemarkForDisplay(receiptData.remark);
  const logoUrl = activeShop?.logoUrl || "/logo.png";
  const docId = receiptData.isDraft ? (receiptData.proformaId || receiptData.id || "DRAFT") : `#${receiptData.id}`;

  const itemsHtml = receiptData.items.map(item => `
    <div style="display: flex; font-size: 10px; line-height: 1.25; margin-bottom: 4px;">
      <span style="flex: 1; min-width: 0; padding-right: 8px; text-align: left;">${item.nameEn || item.name}</span>
      <span style="width: 32px; text-align: center; font-family: monospace;">${item.quantity}</span>
      <span style="width: 60px; text-align: right; font-family: monospace;">฿${formatCurrency(item.price * item.quantity)}</span>
    </div>
  `).join("");

  const deliveryFeeHtml = (receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0) ? `
    <div style="display: flex; font-size: 10px; line-height: 1.25; margin-bottom: 4px; font-weight: 500;">
      <span style="flex: 1; min-width: 0; padding-right: 8px; text-align: left;">Delivery Fee</span>
      <span style="width: 32px; text-align: center; font-family: monospace;">1</span>
      <span style="width: 60px; text-align: right; font-family: monospace;">฿${formatCurrency(receiptData.deliveryFee)}</span>
    </div>
  ` : "";

  container.innerHTML = `
    <div style="width: 280px; background-color: #ffffff; color: #27272a; padding: 20px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position: relative; box-sizing: border-box; text-align: left; font-size: 10px;">
      ${receiptData.isDraft ? `
        <div style="text-align: center; margin-bottom: 8px;">
          <span style="background-color: #e5e5e5; color: #171717; font-weight: bold; font-size: 8px; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; border: 1px solid #a3a3a3;">
            PROFORMA RECEIPT
          </span>
        </div>
      ` : ""}
      <div style="text-align: center; margin-bottom: 12px;">
        <img src="${logoUrl}" alt="Shop Logo" style="height: 36px; max-width: 120px; object-fit: contain; filter: grayscale(100%) contrast(125%); display: block; margin: 0 auto 6px auto;" />
        <h3 style="font-size: 12px; font-weight: 900; color: #171717; text-transform: uppercase; margin: 0 0 2px 0;">${activeShop?.name || "That Laundry Shop"}</h3>
        <p style="font-size: 9px; color: #52525b; margin: 0 0 2px 0;">${activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
        <p style="font-size: 9px; color: #52525b; margin: 0 0 2px 0;">Tel: ${activeShop?.phone || "081-111-2222"}</p>
        ${activeShop?.taxId ? `<p style="font-size: 8.5px; color: #52525b; margin: 0;">TAX ID: ${activeShop.taxId}</p>` : ""}
        <div style="border-top: 1px dashed #a3a3a3; margin: 8px 0;"></div>
      </div>

      <div style="margin-bottom: 8px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #171717;">
          <span>${receiptData.isDraft ? "PROFORMA NO:" : "RECEIPT NO:"}</span>
          <span style="font-family: monospace;">${docId}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>DATE:</span>
          <span>${formattedDate}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>CUSTOMER:</span>
          <span style="font-weight: bold; color: #171717;">${receiptData.customerName || "Walk-In"}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>PHONE:</span>
          <span>${receiptData.customerPhone || "-"}</span>
        </div>
        <div style="border-top: 1px dashed #a3a3a3; margin: 8px 0;"></div>
      </div>

      <div style="margin-bottom: 8px;">
        <div style="display: flex; font-weight: bold; color: #171717; margin-bottom: 4px;">
          <span style="flex: 1; text-align: left;">ITEM</span>
          <span style="width: 32px; text-align: center;">QTY</span>
          <span style="width: 60px; text-align: right;">TOTAL</span>
        </div>
        ${itemsHtml}
        ${deliveryFeeHtml}
        <div style="border-top: 1px dashed #a3a3a3; margin: 8px 0;"></div>
      </div>

      <div style="line-height: 1.5; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <span>SUBTOTAL</span>
          <span style="font-family: monospace;">฿${formatCurrency(subtotalVal)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; color: #171717; border-top: 1px solid #171717; padding-top: 4px; margin-top: 4px;">
          <span>GRAND TOTAL</span>
          <span style="font-family: monospace;">฿${formatCurrency(receiptData.total)}</span>
        </div>
        ${receiptData.vatType === "inclusive" && receiptData.vatRate > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 8px; color: #737373;">
            <span>Includes VAT ${receiptData.vatRate}%</span>
            <span style="font-family: monospace;">฿${formatCurrency(receiptData.vatAmount)}</span>
          </div>
        ` : ""}
      </div>

      ${cleanRemark ? `
        <div style="padding: 6px; background-color: #f5f5f5; border-radius: 4px; font-size: 8.5px; border: 1px solid #e5e7eb; margin-bottom: 8px;">
          <strong>REMARKS:</strong> ${cleanRemark}
        </div>
      ` : ""}

      <div style="text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #737373; font-size: 8px;">
        ${receiptData.isDraft ? "This is a proforma invoice, not an official tax receipt." : "Thank you for your business!"}
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise(r => setTimeout(r, 60));

    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 5000,
    });

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    return blob;
  } catch (err) {
    console.error("DOM Thermal receipt capture failed:", err);
    return null;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

