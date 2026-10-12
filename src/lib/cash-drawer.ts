/**
 * Cash Drawer Hardware Integration (BT-100U / USB-to-RJ11) via Web Serial API
 * Supported in Chrome, Edge, and modern Chromium-based browsers.
 */

import { settingsStore } from "@/lib/store";

export interface CashDrawerStatus {
  supported: boolean;
  isPaired: boolean;
  portInfo?: string;
}

/**
 * Check if the current browser environment supports the Web Serial API
 */
export function isWebSerialSupported(): boolean {
  return typeof window !== "undefined" && "serial" in navigator;
}

/**
 * Human-readable format of USB Vendor and Product ID
 */
export function formatUsbId(vendorId?: number, productId?: number): string {
  if (!vendorId) return "Unknown Device";
  const vidHex = vendorId.toString(16).padStart(4, "0").toUpperCase();
  const pidHex = productId ? productId.toString(16).padStart(4, "0").toUpperCase() : "----";

  // Known chipsets common in BT-100U and POS triggers
  if (vidHex === "067B") return `Prolific USB-Serial (VID:${vidHex} PID:${pidHex})`;
  if (vidHex === "1A86") return `CH340 USB-Serial (VID:${vidHex} PID:${pidHex})`;
  if (vidHex === "0403") return `FTDI USB-Serial (VID:${vidHex} PID:${pidHex})`;
  if (vidHex === "10C4") return `Silicon Labs CP210x (VID:${vidHex} PID:${pidHex})`;

  return `USB Serial (VID:${vidHex} PID:${pidHex})`;
}

/**
 * Retrieve the first paired serial port if available
 */
export async function getPairedPort(): Promise<any | null> {
  if (!isWebSerialSupported()) return null;
  try {
    const ports = await (navigator as any).serial.getPorts();
    if (ports && ports.length > 0) {
      return ports[0];
    }
  } catch (err) {
    console.warn("[CashDrawer] getPorts error:", err);
  }
  return null;
}

/**
 * Get current connection and pairing status
 */
export async function getCashDrawerStatus(): Promise<CashDrawerStatus> {
  if (!isWebSerialSupported()) {
    return { supported: false, isPaired: false };
  }

  const port = await getPairedPort();
  if (!port) {
    return { supported: true, isPaired: false };
  }

  try {
    const info = port.getInfo ? port.getInfo() : {};
    return {
      supported: true,
      isPaired: true,
      portInfo: formatUsbId(info.usbVendorId, info.usbProductId),
    };
  } catch {
    return { supported: true, isPaired: true, portInfo: "Paired Serial Device" };
  }
}

/**
 * Request user permission to pair with BT-100U or any USB-Serial cash drawer trigger
 * Must be called in response to a direct user click/gesture
 */
export async function pairCashDrawer(): Promise<{ success: boolean; portInfo?: string; error?: string }> {
  if (!isWebSerialSupported()) {
    return {
      success: false,
      error: "Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.",
    };
  }

  try {
    // We allow user to select any serial port without strict vendor filter
    // so any compatible adapter (Prolific, CH340, FTDI) can be paired.
    const port = await (navigator as any).serial.requestPort({
      filters: [
        { usbVendorId: 0x067b }, // Prolific PL2303 (BT-100U default)
        { usbVendorId: 0x1a86 }, // CH340
        { usbVendorId: 0x0403 }, // FTDI
        { usbVendorId: 0x10c4 }, // CP210x
      ],
    });

    const info = port.getInfo ? port.getInfo() : {};
    const portInfo = formatUsbId(info.usbVendorId, info.usbProductId);
    return { success: true, portInfo };
  } catch (err: any) {
    if (err.name === "NotFoundError") {
      return { success: false, error: "User cancelled device pairing." };
    }
    console.error("[CashDrawer] pairCashDrawer error:", err);
    return { success: false, error: err.message || "Failed to pair cash drawer device." };
  }
}

/**
 * Send pulse to kick open the cash drawer
 */
export async function kickCashDrawer(): Promise<{ success: boolean; error?: string }> {
  if (!isWebSerialSupported()) {
    return { success: false, error: "Web Serial API is not supported in this browser." };
  }

  const port = await getPairedPort();
  if (!port) {
    return {
      success: false,
      error: "No paired cash drawer port found. Please pair device in Settings first.",
    };
  }

  let openedByUs = false;
  try {
    if (!port.readable || !port.writable) {
      await port.open({ baudRate: 9600 });
      openedByUs = true;
    }

    if (!port.writable) {
      return { success: false, error: "Port writable stream is not accessible." };
    }

    const writer = port.writable.getWriter();
    try {
      // Combination of standard ESC/POS drawer kick command (ESC p 0 25 250)
      // plus pulse byte (0x01) to support 100% of BT-100U revisions and clones.
      const kickBytes = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa, 0x01, 0x0a]);
      await writer.write(kickBytes);
    } finally {
      writer.releaseLock();
    }

    // Give the hardware UART 80ms to flush the buffer before closing
    await new Promise((r) => setTimeout(r, 80));

    if (openedByUs) {
      await port.close();
    }

    return { success: true };
  } catch (err: any) {
    console.error("[CashDrawer] kickCashDrawer error:", err);
    // Attempt emergency cleanup if port is still open
    if (openedByUs) {
      try {
        await port.close();
      } catch {}
    }
    return { success: false, error: err.message || "Failed to trigger cash drawer kick." };
  }
}

/**
 * Check if the transaction contains cash
 */
export function isCashPayment(
  paymentChannel?: string | null,
  splitPayments?: Array<{ channel?: string; amount?: number }> | null
): boolean {
  if (!paymentChannel) return false;

  const normalized = paymentChannel.trim().toLowerCase();
  if (normalized === "cash" || normalized.includes("เงินสด")) {
    return true;
  }

  if (normalized.includes("split") && Array.isArray(splitPayments)) {
    return splitPayments.some((s) => {
      const ch = (s.channel || "").trim().toLowerCase();
      const amt = Number(s.amount) || 0;
      return (ch === "cash" || ch.includes("เงินสด")) && amt > 0;
    });
  }

  return false;
}

/**
 * Triggers the cash drawer kick if the given action is enabled in settings and payment contains cash
 */
export async function triggerCashDrawerIfEnabled(
  action: "pay" | "print",
  paymentChannel?: string | null,
  splitPayments?: Array<{ channel?: string; amount?: number }> | null,
  customSettings?: Record<string, string> | null
): Promise<boolean> {
  const settings = customSettings || settingsStore.getSnapshot();

  // Check if this action trigger is enabled in settings
  if (action === "pay") {
    const isAutoPayEnabled = settings?.cashDrawerAutoOpenOnPay !== "false"; // default true
    if (!isAutoPayEnabled) return false;
  } else if (action === "print") {
    const isAutoPrintEnabled = settings?.cashDrawerAutoOpenOnPrint !== "false"; // default true
    if (!isAutoPrintEnabled) return false;
  }

  // Check if payment contains cash
  if (!isCashPayment(paymentChannel, splitPayments)) {
    return false;
  }

  const res = await kickCashDrawer();
  if (!res.success && res.error && res.error !== "User cancelled device pairing.") {
    console.warn("[CashDrawer] Trigger notice:", res.error);
  }
  return res.success;
}
