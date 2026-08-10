import { format } from "date-fns";
import type { ReceiptData, ShopInfo } from "@/components/thermal-receipt-dialog";

export async function generateThermalReceiptImage(
  receiptData: ReceiptData,
  activeShop?: ShopInfo | null
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 80mm thermal paper standard width: 576px canvas width (at 2x for sharp print quality)
  const width = 576;
  const padding = 24;
  const contentWidth = width - padding * 2;

  // Dynamic height calculation
  const itemsCount = receiptData.items.length;
  const hasDeliveryFee = (receiptData.deliveryFee || 0) > 0;
  const baseHeight = 550 + (itemsCount + (hasDeliveryFee ? 1 : 0)) * 32;
  const height = baseHeight;

  canvas.width = width;
  canvas.height = height;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000000";
  let y = padding + 20;

  // Header Title
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(receiptData.isDraft ? "PROFORMA RECEIPT" : (receiptData.status === "cancel" ? "VOID SLIP" : "RECEIPT"), width / 2, y);
  y += 28;

  // Shop Name & Details
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(activeShop?.name || "That Laundry Shop", width / 2, y);
  y += 24;

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#444444";
  ctx.fillText(`Tel: ${activeShop?.phone || "081-111-2222"}`, width / 2, y);
  y += 20;
  if (activeShop?.taxId) {
    ctx.fillText(`TAX ID: ${activeShop.taxId}`, width / 2, y);
    y += 20;
  }

  // Dashed separator
  ctx.fillStyle = "#000000";
  const drawDashedLine = (lineY: number) => {
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(padding, lineY);
    ctx.lineTo(width - padding, lineY);
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawDashedLine(y);
  y += 18;

  // Order Details Left/Right alignment
  ctx.font = "15px monospace";
  const drawRow = (label: string, value: string, isBold = false) => {
    ctx.font = isBold ? "bold 15px monospace" : "15px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";
    ctx.fillText(label, padding, y);
    ctx.textAlign = "right";
    ctx.fillText(value, width - padding, y);
    y += 22;
  };

  const docId = receiptData.isDraft 
    ? receiptData.id 
    : (receiptData.status === "cancel" ? `${receiptData.id}-VOID` : `#${receiptData.id}`);

  const safeCreatedAt = receiptData.createdAt 
    ? (receiptData.createdAt instanceof Date ? receiptData.createdAt : new Date(receiptData.createdAt))
    : new Date();
  const validCreatedAt = isNaN(safeCreatedAt.getTime()) ? new Date() : safeCreatedAt;

  drawRow(receiptData.isDraft ? "PROFORMA NO:" : "RECEIPT NO:", docId, true);
  if (!receiptData.isDraft && receiptData.proformaId) {
    drawRow("PROFORMA NO:", receiptData.proformaId, true);
  }
  drawRow("DATE:", format(validCreatedAt, "dd/MM/yyyy HH:mm"));
  drawRow("CUSTOMER:", receiptData.customerName || "Walk-In");
  drawRow("PHONE:", receiptData.customerPhone || "-");

  // Note: DUE DATE omitted to match dialog display

  drawDashedLine(y);
  y += 18;

  // Table Headers
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "left";
  ctx.fillText("ITEM", padding, y);
  ctx.textAlign = "center";
  ctx.fillText("QTY", width / 2 + 30, y);
  ctx.textAlign = "right";
  ctx.fillText("TOTAL", width - padding, y);
  y += 22;

  // Items List
  ctx.font = "14px monospace";
  receiptData.items.forEach(item => {
    ctx.textAlign = "left";
    // Use English name (nameEn) if available — matches dialog which shows nameEn || name
    const displayName = (item.nameEn || item.name) || "";
    const name = displayName.length > 18 ? displayName.substring(0, 17) + "…" : displayName;
    ctx.fillText(name, padding, y);
    ctx.textAlign = "center";
    ctx.fillText(String(item.quantity), width / 2 + 30, y);
    ctx.textAlign = "right";
    ctx.fillText(`฿${(item.price * item.quantity).toFixed(2)}`, width - padding, y);
    y += 22;
  });

  // Delivery Fee under items
  if (hasDeliveryFee) {
    ctx.textAlign = "left";
    ctx.fillText("Delivery Fee", padding, y);
    ctx.textAlign = "center";
    ctx.fillText("1", width / 2 + 30, y);
    ctx.textAlign = "right";
    ctx.fillText(`฿${(receiptData.deliveryFee || 0).toFixed(2)}`, width - padding, y);
    y += 22;
  }

  drawDashedLine(y);
  y += 22;

  // Grand Total & VAT
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "left";
  ctx.fillText("GRAND TOTAL:", padding, y);
  ctx.textAlign = "right";
  ctx.fillText(`฿${receiptData.total.toFixed(2)}`, width - padding, y);
  y += 22;

  if (receiptData.vatType && receiptData.vatType !== "none" && receiptData.vatAmount) {
    ctx.font = "13px monospace";
    ctx.fillStyle = "#555555";
    ctx.textAlign = "left";
    ctx.fillText(`Incl. VAT ${receiptData.vatRate}%`, padding, y);
    ctx.textAlign = "right";
    ctx.fillText(`฿${receiptData.vatAmount.toFixed(2)}`, width - padding, y);
    y += 22;
  }

  drawDashedLine(y);
  y += 22;

  // Payment Status Box
  ctx.textAlign = "center";
  ctx.font = "bold 16px monospace";
  ctx.fillStyle = "#000000";
  if (receiptData.isPaid) {
    ctx.fillText(`PAID - ${receiptData.paymentChannel || "Cash"}`, width / 2, y);
  } else {
    ctx.fillText("UNPAID - PAY ON PICKUP", width / 2, y);
  }
  y += 24;

  // Remark box if present
  if (receiptData.remark) {
    ctx.font = "12px monospace";
    ctx.fillStyle = "#333333";
    const remarkText = receiptData.remark.length > 42 ? receiptData.remark.substring(0, 40) + "…" : receiptData.remark;
    ctx.fillText(`REMARK: ${remarkText}`, width / 2, y);
    y += 24;
  }

  // Fast Barcode Drawing (repeating lines)
  y += 10;
  const barcodeHeight = 36;
  const barcodeWidth = 260;
  const startX = (width - barcodeWidth) / 2;

  ctx.fillStyle = "#000000";
  for (let i = 0; i < barcodeWidth; i += 4) {
    const lineWidth = (i % 8 === 0) ? 3 : 1.5;
    ctx.fillRect(startX + i, y, lineWidth, barcodeHeight);
  }
  y += barcodeHeight + 10;

  // Barcode text underneath
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#555555";
  const barcodeStr = docId.split("").join(" ");
  ctx.fillText(barcodeStr, width / 2, y);
  y += 18;

  ctx.font = "12px monospace";
  ctx.fillText(receiptData.isDraft ? "PROFORMA RECEIPT ONLY" : "THANK YOU FOR YOUR SERVICE!", width / 2, y);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
