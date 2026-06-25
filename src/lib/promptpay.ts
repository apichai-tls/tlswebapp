/**
 * PromptPay EMVCo Payload Generator
 * Formats standard PromptPay payments payload for mobile numbers (10 digits)
 * or National ID / Tax ID (13 digits).
 */

function crc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePromptPayPayload(target: string, amount?: number): string {
  // Remove non-digit characters
  const sanitizeTarget = target.replace(/[^0-9]/g, '');
  let formattedTarget = '';
  let targetTag = '';

  if (sanitizeTarget.length === 10) {
    // Mobile number: prefix with 0066 and drop leading 0
    formattedTarget = '0066' + sanitizeTarget.substring(1);
    targetTag = '0113' + formattedTarget;
  } else if (sanitizeTarget.length === 13) {
    // National ID / Tax ID
    formattedTarget = sanitizeTarget;
    targetTag = '0213' + formattedTarget;
  } else {
    throw new Error('Invalid PromptPay target. Must be 10-digit mobile number or 13-digit Tax ID.');
  }

  // EMVCo structure:
  // Tag 00 (Payload Format Indicator): "000201" (fixed)
  // Tag 01 (Point of Initiation Method): "010211" (static QR) or "010212" (dynamic QR)
  // We use "11" as it is supported universally.
  let payload = '000201010211';

  // Tag 29 (Merchant Account Information - PromptPay)
  const aid = '0016A000000677010111';
  const tag29Value = aid + targetTag;
  const tag29Length = String(tag29Value.length).padStart(2, '0');
  payload += '29' + tag29Length + tag29Value;

  // Tag 53 (Transaction Currency): "5303764" (764 = THB)
  payload += '5303764';

  // Tag 54 (Transaction Amount): e.g. "5406150.00"
  if (amount !== undefined && amount > 0) {
    const amountStr = amount.toFixed(2);
    const amountLen = String(amountStr.length).padStart(2, '0');
    payload += '54' + amountLen + amountStr;
  }

  // Tag 58 (Country Code): "5802TH"
  payload += '5802TH';

  // Tag 63 (Checksum): "6304" followed by 4 hex characters of CRC16
  payload += '6304';
  
  const checksum = crc16(payload);
  payload += checksum;

  return payload;
}
