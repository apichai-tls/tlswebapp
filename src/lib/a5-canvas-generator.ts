import { format } from "date-fns";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";

function formatCurrency(val: number): string {
  return (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateA5ReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // A5 standard proportions canvas (800 x 1130 px @ 2x high dpi)
  const width = 800;
  const padding = 50;
  const contentWidth = width - padding * 2;

  // Dynamic height calculation
  const itemsCount = receiptData.items.length;
  const hasDeliveryFee = (receiptData.deliveryFee || 0) > 0;
  const hasExpress = (receiptData.expressSurcharge || 0) > 0;
  const hasDiscount = (receiptData.discount || 0) > 0;
  const extraRows = (hasDeliveryFee ? 1 : 0) + (hasExpress ? 1 : 0) + (hasDiscount ? 1 : 0);
  
  const baseHeight = 900 + (itemsCount + extraRows) * 36;
  const height = Math.max(1130, baseHeight);

  canvas.width = width;
  canvas.height = height;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Try loading logo image asynchronously if available
  const logoUrl = activeShop?.logoUrl || "/logo.png";
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  } catch {}

  ctx.fillStyle = "#111827"; // neutral-900
  let y = padding + 10;

  // Header Left - Logo & Shop Info
  if (logoImg) {
    const logoHeight = 54;
    const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
    ctx.drawImage(logoImg, padding, y, Math.min(logoWidth, 220), logoHeight);
    y += logoHeight + 12;
  }

  ctx.textAlign = "left";
  ctx.font = "900 22px sans-serif";
  ctx.fillStyle = "#111827";
  const shopName = (activeShop?.name || "That Laundry Shop").toUpperCase();
  // Wrap shop name if it's too long
  const shopNameWords = shopName.split(" ");
  let shopNameLine = "";
  for (let i = 0; i < shopNameWords.length; i++) {
    const testLine = shopNameLine + shopNameWords[i] + " ";
    if (ctx.measureText(testLine).width > (width / 2 - padding - 20) && i > 0) {
      ctx.fillText(shopNameLine.trim(), padding, y);
      shopNameLine = shopNameWords[i] + " ";
      y += 26;
    } else {
      shopNameLine = testLine;
    }
  }
  if (shopNameLine.trim()) {
    ctx.fillText(shopNameLine.trim(), padding, y);
    y += 26;
  }

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#4b5563"; // neutral-600
  const shopAddress = activeShop?.address || "123 Sukhumvit Road, Bangkok";
  
  // Wrap address across multiple lines cleanly
  const words = shopAddress.split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    if (ctx.measureText(testLine).width > 280 && i > 0) {
      ctx.fillText(line.trim(), padding, y);
      line = words[i] + " ";
      y += 18;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), padding, y);
    y += 18;
  }

  ctx.fillText(`Tel: ${activeShop?.phone || "081-111-2222"}`, padding, y);
  y += 18;
  if (activeShop?.taxId) {
    ctx.fillText(`TAX ID: ${activeShop.taxId}`, padding, y);
    y += 18;
  }

  // Header Right - Document Title & Document Nos
  let rightY = padding + 10;
  ctx.textAlign = "right";
  ctx.font = "900 24px sans-serif";
  ctx.fillStyle = "#111827";
  const docTitle = receiptData.isDraft ? "PROFORMA INVOICE" : (receiptData.status === "cancel" ? "VOID RECEIPT" : "RECEIPT");
  ctx.fillText(docTitle, width - padding, rightY);
  rightY += 30;

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#374151";

  const docId = receiptData.isDraft 
    ? (receiptData.proformaId || receiptData.id || "DRAFT")
    : (receiptData.status === "cancel" ? `${receiptData.id}-VOID` : `#${receiptData.id}`);

  ctx.fillText(`${receiptData.isDraft ? "PROFORMA NO:" : "RECEIPT NO:"} ${docId}`, width - padding, rightY);
  rightY += 20;

  if (!receiptData.isDraft && receiptData.proformaId) {
    ctx.fillText(`PROFORMA NO: ${receiptData.proformaId}`, width - padding, rightY);
    rightY += 20;
  }

  const safeCreatedAt = receiptData.createdAt 
    ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt))
    : new Date();
  const validCreatedAt = isNaN(safeCreatedAt.getTime()) ? new Date() : safeCreatedAt;
  ctx.fillText(`DATE: ${format(validCreatedAt, "dd/MM/yyyy HH:mm")}`, width - padding, rightY);

  y = Math.max(y, rightY) + 20;

  // Divider Line
  ctx.strokeStyle = "#e5e7eb"; // neutral-200
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 24;

  // Customer Section (Billed To)
  const custY = y;
  ctx.textAlign = "left";
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = "#6b7280"; // neutral-500
  ctx.fillText("BILLED TO", padding, custY);

  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.fillText(receiptData.customerName || "Walk-In Guest", padding, custY + 24);

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#4b5563";
  ctx.fillText(receiptData.customerPhone || "-", padding, custY + 44);

  y = custY + 68;

  // Table Header Line
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();

  ctx.font = "bold 15px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  ctx.fillText("DESCRIPTION", padding + 5, y + 22);
  ctx.textAlign = "center";
  ctx.fillText("QTY", width - padding - 280, y + 22);
  ctx.textAlign = "right";
  ctx.fillText("UNIT PRICE", width - padding - 130, y + 22);
  ctx.fillText("TOTAL", width - padding - 5, y + 22);

  y += 34;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();

  // Table Body Rows
  ctx.font = "16px sans-serif";
  receiptData.items.forEach((item) => {
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "left";
    const displayName = (item.nameEn || item.name) || "";
    const name = displayName.length > 40 ? displayName.substring(0, 38) + "…" : displayName;
    ctx.fillText(name, padding + 5, y + 26);

    ctx.textAlign = "center";
    ctx.fillText(String(item.quantity), width - padding - 280, y + 26);

    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(item.price), width - padding - 130, y + 26);
    ctx.fillText(formatCurrency(item.price * item.quantity), width - padding - 5, y + 26);

    y += 40;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  });

  if (hasDeliveryFee) {
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "left";
    ctx.fillText("Delivery Fee", padding + 5, y + 26);
    ctx.textAlign = "center";
    ctx.fillText("1", width - padding - 280, y + 26);
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(receiptData.deliveryFee || 0), width - padding - 130, y + 26);
    ctx.fillText(formatCurrency(receiptData.deliveryFee || 0), width - padding - 5, y + 26);
    y += 40;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (hasExpress) {
    ctx.fillStyle = "#be123c"; // rose-700
    ctx.textAlign = "left";
    ctx.fillText(`Express Surcharge (${receiptData.serviceSpeed === "express_50" ? "+50%" : "+100%"})`, padding + 5, y + 26);
    ctx.textAlign = "center";
    ctx.fillText("1", width - padding - 280, y + 26);
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(receiptData.expressSurcharge), width - padding - 130, y + 26);
    ctx.fillText(formatCurrency(receiptData.expressSurcharge), width - padding - 5, y + 26);
    y += 40;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (hasDiscount) {
    ctx.fillStyle = "#047857"; // emerald-700
    ctx.textAlign = "left";
    ctx.fillText(`Discount ${receiptData.discountPercent ? `(${receiptData.discountPercent}%)` : ""}`, padding + 5, y + 26);
    ctx.textAlign = "center";
    ctx.fillText("1", width - padding - 280, y + 26);
    ctx.textAlign = "right";
    ctx.fillText(`-${formatCurrency(receiptData.discount)}`, width - padding - 130, y + 26);
    ctx.fillText(`-${formatCurrency(receiptData.discount)}`, width - padding - 5, y + 26);
    y += 40;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  y += 24;

  // Totals Section (Right Aligned)
  const totalsX = width - padding - 340;
  const totalsValX = width - padding - 5;

  ctx.font = "bold 15px sans-serif";
  ctx.fillStyle = "#374151";
  ctx.textAlign = "left";
  ctx.fillText("SUBTOTAL", totalsX, y);
  ctx.textAlign = "right";
  const subtotalVal = receiptData.subtotal + receiptData.expressSurcharge + (receiptData.deliveryFee || 0) - receiptData.discount;
  ctx.fillText(`฿${formatCurrency(subtotalVal)}`, totalsValX, y);
  y += 28;

  if (receiptData.vatType === "exclusive" && receiptData.vatRate > 0) {
    const calcVatEx = receiptData.vatAmount || (subtotalVal * (receiptData.vatRate / 100));
    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.fillText(`VAT (${receiptData.vatRate}%)`, totalsX, y);
    ctx.textAlign = "right";
    ctx.fillText(`฿${formatCurrency(calcVatEx)}`, totalsValX, y);
    y += 28;
  }

  // Grand Total Line
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(totalsX, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 32;

  ctx.font = "900 24px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  ctx.fillText("GRAND TOTAL", totalsX, y);
  ctx.textAlign = "right";
  ctx.fillText(`฿${formatCurrency(receiptData.total)}`, totalsValX, y);
  y += 28;

  if (receiptData.vatType === "inclusive" && receiptData.vatRate > 0) {
    const calcVatInc = receiptData.vatAmount || (receiptData.total * (receiptData.vatRate / (100 + receiptData.vatRate)));
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "left";
    ctx.fillText(`Includes VAT ${receiptData.vatRate}%`, totalsX, y);
    ctx.textAlign = "right";
    ctx.fillText(`฿${formatCurrency(calcVatInc)}`, totalsValX, y);
    y += 24;
  }

  // Footer Note & Stamp at bottom
  const footerY = height - padding - 20;

  if (receiptData.status === "cancel") {
    ctx.strokeStyle = "#e11d48"; // rose-600
    ctx.fillStyle = "#e11d48";
    ctx.lineWidth = 4;
    ctx.font = "900 20px sans-serif";
    ctx.strokeRect(width - padding - 150, footerY - 75, 150, 52);
    ctx.textAlign = "center";
    ctx.fillText("VOIDED", width - padding - 75, footerY - 42);
  }

  // Bottom Line & Footer text
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, footerY - 15);
  ctx.lineTo(width - padding, footerY - 15);
  ctx.stroke();

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "center";
  const footerText = receiptData.isDraft 
    ? "This is a proforma invoice, not an official tax receipt."
    : (receiptData.status === "cancel" ? "This order has been cancelled" : "Thank you for your business!");
  ctx.fillText(footerText, width / 2, footerY + 12);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
