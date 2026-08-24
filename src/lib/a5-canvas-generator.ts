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
 * Generate A5 Receipt Image using Method 1 (HTML DOM + html2canvas-pro)
 * This guarantees 100% identical styling, fonts, logo, and layout between
 * Dialog preview and background save generation.
 */
export async function generateA5ReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  // Create an off-screen container in DOM
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-99999";
  container.style.opacity = "0.01";
  container.style.pointerEvents = "none";
  container.style.width = "148mm";

  const safeCreatedAt = receiptData.createdAt 
    ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt))
    : new Date();
  const validCreatedAt = isNaN(safeCreatedAt.getTime()) ? new Date() : safeCreatedAt;
  const formattedDate = format(validCreatedAt, "dd/MM/yyyy HH:mm");

  const subtotalVal = receiptData.subtotal + receiptData.expressSurcharge + (receiptData.deliveryFee || 0) - receiptData.discount;
  const cleanRemark = cleanRemarkForDisplay(receiptData.remark);
  const logoUrl = activeShop?.logoUrl || "/logo.png";

  const itemsHtml = receiptData.items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 4px;">${item.nameEn || item.name}</td>
      <td style="padding: 12px 4px; text-align: center; font-family: monospace;">${item.quantity}</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(item.price)}</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join("");

  const deliveryFeeHtml = (receiptData.deliveryFee !== undefined && receiptData.deliveryFee > 0) ? `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 4px;">Delivery Fee</td>
      <td style="padding: 12px 4px; text-align: center; font-family: monospace;">1</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(receiptData.deliveryFee)}</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(receiptData.deliveryFee)}</td>
    </tr>
  ` : "";

  const expressHtml = receiptData.expressSurcharge > 0 ? `
    <tr style="border-bottom: 1px solid #e5e7eb; color: #be123c;">
      <td style="padding: 12px 4px;">Express Surcharge ${receiptData.serviceSpeed === "express_50" ? "(+50%)" : "(+100%)"}</td>
      <td style="padding: 12px 4px; text-align: center; font-family: monospace;">1</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(receiptData.expressSurcharge)}</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">${formatCurrency(receiptData.expressSurcharge)}</td>
    </tr>
  ` : "";

  const discountHtml = receiptData.discount > 0 ? `
    <tr style="border-bottom: 1px solid #e5e7eb; color: #059669;">
      <td style="padding: 12px 4px;">Discount ${receiptData.discountPercent ? `(${receiptData.discountPercent}%)` : ""}</td>
      <td style="padding: 12px 4px; text-align: center; font-family: monospace;">1</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">-${formatCurrency(receiptData.discount)}</td>
      <td style="padding: 12px 4px; text-align: right; font-family: monospace;">-${formatCurrency(receiptData.discount)}</td>
    </tr>
  ` : "";

  container.innerHTML = `
    <div style="width: 148mm; min-height: 210mm; background-color: #ffffff; color: #27272a; padding: 32px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position: relative; box-sizing: border-box; text-align: left;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div style="flex: 1;">
          <div style="margin-bottom: 8px;">
            <img src="${logoUrl}" alt="Shop Logo" style="height: 40px; object-fit: contain; filter: grayscale(100%) contrast(125%); display: block;" />
          </div>
          <h1 style="font-size: 18px; font-weight: 900; color: #171717; text-transform: uppercase; letter-spacing: -0.025em; line-height: 1.25; margin: 0;">${activeShop?.name || "That Laundry Shop"}</h1>
          <p style="font-size: 12px; color: #52525b; max-width: 250px; margin: 4px 0 0 0;">${activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
          <p style="font-size: 12px; color: #52525b; margin: 2px 0 0 0;">Tel: ${activeShop?.phone || "081-111-2222"}</p>
          ${activeShop?.taxId ? `<p style="font-size: 12px; color: #52525b; margin: 2px 0 0 0;"><span style="font-weight: bold;">TAX ID:</span> ${activeShop.taxId}</p>` : ""}
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 18px; font-weight: 900; color: #171717; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px 0;">
            ${receiptData.isDraft ? "PROFORMA INVOICE" : (receiptData.status === "cancel" ? "VOID RECEIPT" : "RECEIPT")}
          </h2>
          <div style="font-size: 12px; margin-bottom: 4px;">
            <span style="font-weight: bold; color: #404040; margin-right: 4px;">${receiptData.isDraft ? "PROFORMA NO:" : "RECEIPT NO:"}</span>
            <span style="font-family: monospace; font-weight: 500; color: #171717;">${receiptData.proformaId || receiptData.id || "DRAFT"}</span>
          </div>
          <div style="font-size: 12px;">
            <span style="font-weight: bold; color: #404040; margin-right: 4px;">DATE:</span>
            <span style="font-weight: 500; color: #171717;">${formattedDate}</span>
          </div>
        </div>
      </div>

      <hr style="border: none; border-top: 1px solid #d4d4d4; margin: 0 0 16px 0;" />

      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <div style="flex: 1;">
          <h3 style="font-size: 12px; font-weight: bold; color: #737373; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px 0;">BILLED TO</h3>
          <p style="font-size: 14px; font-weight: bold; color: #171717; line-height: 1.25; margin: 0;">${receiptData.customerName || "Walk-In"}</p>
          <p style="font-size: 12px; color: #52525b; font-family: monospace; margin: 2px 0 0 0;">${receiptData.customerPhone || "-"}</p>
        </div>
        ${receiptData.deliveryScheduledAt ? `
          <div style="flex: 1; text-align: right;">
            <h3 style="font-size: 12px; font-weight: bold; color: #737373; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px 0;">COLLECTION DATE</h3>
            <p style="font-size: 14px; font-weight: bold; color: #171717; line-height: 1.25; margin: 0;">${format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy")}</p>
            <p style="font-size: 12px; color: #52525b; margin: 2px 0 0 0;">${format(new Date(receiptData.deliveryScheduledAt), "HH:mm")}</p>
          </div>
        ` : ""}
      </div>

      <table style="width: 100%; text-align: left; margin-bottom: 16px; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #262626; font-size: 14px; font-weight: bold; color: #171717;">
            <th style="padding: 8px 4px; width: 50%;">DESCRIPTION</th>
            <th style="padding: 8px 4px; text-align: center;">QTY</th>
            <th style="padding: 8px 4px; text-align: right;">UNIT PRICE</th>
            <th style="padding: 8px 4px; text-align: right;">TOTAL</th>
          </tr>
        </thead>
        <tbody style="font-size: 14px; color: #262626; font-weight: 500;">
          ${itemsHtml}
          ${deliveryFeeHtml}
          ${expressHtml}
          ${discountHtml}
        </tbody>
      </table>

      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="width: 50%;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #404040;">
            <span>SUBTOTAL</span>
            <span style="font-family: monospace;">฿${formatCurrency(subtotalVal)}</span>
          </div>
          ${receiptData.vatType === "exclusive" && receiptData.vatRate > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #404040; border-bottom: 1px solid #e5e7eb;">
              <span>VAT (${receiptData.vatRate}%)</span>
              <span style="font-family: monospace;">฿${formatCurrency(receiptData.vatAmount)}</span>
            </div>
          ` : ""}
          <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 900; color: #171717; border-top: 2px solid #171717;">
            <span>GRAND TOTAL</span>
            <span style="font-family: monospace;">฿${formatCurrency(receiptData.total)}</span>
          </div>
          ${receiptData.vatType === "inclusive" && receiptData.vatRate > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #737373;">
              <span>Includes VAT ${receiptData.vatRate}%</span>
              <span style="font-family: monospace;">฿${formatCurrency(receiptData.vatAmount)}</span>
            </div>
          ` : ""}
        </div>
      </div>

      <div style="position: absolute; bottom: 38px; left: 38px; right: 38px;">
        ${cleanRemark ? `
          <div style="padding: 12px; background-color: #f5f5f5; border-radius: 8px; font-size: 14px; color: #404040; border: 1px solid #e5e7eb; margin-bottom: 16px;">
            <span style="font-weight: bold; color: #171717;">REMARKS:</span><br/>
            ${cleanRemark}
          </div>
        ` : ""}
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #737373; font-weight: 500; margin: 0;">
            ${receiptData.isDraft 
              ? "This is a proforma invoice, not an official tax receipt." 
              : (receiptData.status === "cancel" ? "This order has been cancelled" : "Thank you for your business!")}
          </p>
        </div>
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
    console.error("DOM A5 receipt capture failed:", err);
    return null;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
