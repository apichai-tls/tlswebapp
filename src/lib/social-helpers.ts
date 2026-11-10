import { SocialChannel } from '@/types/social-inbox';

/**
 * Formats a phone number into clean international E.164 digits (without '+') suitable for WhatsApp (wa.me / Cloud API).
 * Example:
 *  - ("081-234-5678", "66") -> "66812345678"
 *  - ("+65 9123 4567", "66") -> "6591234567"
 *  - ("66891112222", "66") -> "66891112222"
 */
export function formatPhoneForWhatsApp(rawPhone: string, defaultCountryCode = '66'): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  const cleanCountry = (defaultCountryCode || '66').replace(/\D/g, '') || '66';

  // Auto-heal previously double-prefixed 10-digit international numbers (e.g., +6665xxxxxxxx -> 65xxxxxxxx)
  if (digits.startsWith(`${cleanCountry}65`) && digits.length === cleanCountry.length + 10) {
    digits = digits.slice(cleanCountry.length);
  }

  // If user explicitly started with '+' (e.g. +6591234567 or +660812345678)
  if (hasPlus) {
    if (digits.startsWith(`${cleanCountry}0`)) {
      return `${cleanCountry}${digits.slice(cleanCountry.length + 1)}`;
    }
    return digits;
  }

  // If starts with '00' international prefix
  if (digits.startsWith('00') && digits.length > 9) {
    return digits.slice(2);
  }

  // If local number starting with '0' (e.g., Thai 0812345678 -> 10 digits, or 021234567 -> 9 digits)
  if (digits.startsWith('0')) {
    return `${cleanCountry}${digits.replace(/^0+/, '')}`;
  }

  // If already starts with country code and has full international length
  if (digits.startsWith(cleanCountry) && digits.length >= 10) {
    return digits;
  }

  // If 7-9 digits without leading 0, prepend default country code (10+ digits without leading 0 are already international E.164, e.g. 65xxxxxxxx)
  if (digits.length >= 7 && digits.length <= 9) {
    return `${cleanCountry}${digits}`;
  }

  return digits;
}

/**
 * Formats an E.164 digit string into a human-readable international display string.
 * Example: "66812345678" -> "+66 81 234 5678"
 */
export function formatDisplayPhone(rawPhone?: string | null, defaultCountryCode = '66'): string {
  if (!rawPhone) return '';
  const e164 = formatPhoneForWhatsApp(rawPhone, defaultCountryCode);
  if (!e164) return rawPhone;

  if (e164.startsWith('66') && e164.length === 11) {
    const p1 = e164.slice(2, 4);
    const p2 = e164.slice(4, 7);
    const p3 = e164.slice(7);
    return `+66 ${p1} ${p2} ${p3}`;
  }

  return `+${e164}`;
}

/**
 * Builds an official WhatsApp click-to-chat URL (`https://wa.me/<e164>?text=...`)
 */
export function buildWhatsAppUrl(
  rawPhone: string,
  messageText?: string,
  defaultCountryCode = '66'
): string {
  const e164 = formatPhoneForWhatsApp(rawPhone, defaultCountryCode);
  if (!e164) return 'https://web.whatsapp.com/';
  const baseUrl = `https://wa.me/${e164}`;
  if (messageText && messageText.trim()) {
    return `${baseUrl}?text=${encodeURIComponent(messageText.trim())}`;
  }
  return baseUrl;
}

/**
 * Builds a direct WhatsApp Web chat URL (`https://web.whatsapp.com/send?phone=<e164>&text=...`)
 * Opens directly inside WhatsApp Web without the intermediate wa.me landing page.
 */
export function buildWhatsAppWebUrl(
  rawPhone: string,
  messageText?: string,
  defaultCountryCode = '66'
): string {
  const e164 = formatPhoneForWhatsApp(rawPhone, defaultCountryCode);
  if (!e164) return 'https://web.whatsapp.com/';
  const params = new URLSearchParams({ phone: e164 });
  if (messageText && messageText.trim()) {
    params.set('text', messageText.trim());
  }
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

/**
 * Builds a native WhatsApp Desktop / Mobile App protocol URL (`whatsapp://send?phone=<e164>&text=...`)
 */
export function buildWhatsAppProtocolUrl(
  rawPhone: string,
  messageText?: string,
  defaultCountryCode = '66'
): string {
  const e164 = formatPhoneForWhatsApp(rawPhone, defaultCountryCode);
  if (!e164) return 'whatsapp://';
  const params = new URLSearchParams({ phone: e164 });
  if (messageText && messageText.trim()) {
    params.set('text', messageText.trim());
  }
  return `whatsapp://send?${params.toString()}`;
}

/**
 * Normalizes a phone string for loose CRM customer matching (last 8-9 digits)
 */
export function normalizePhoneKey(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

export function getChannelColorClasses(channel: SocialChannel): {
  badge: string;
  dot: string;
  border: string;
  lightBg: string;
} {
  switch (channel) {
    case 'whatsapp':
      return {
        badge: 'bg-[#25D366] text-white',
        dot: 'bg-[#25D366]',
        border: 'border-emerald-300',
        lightBg: 'bg-emerald-50/70 text-emerald-800',
      };
    case 'line':
      return {
        badge: 'bg-[#06C755] text-white',
        dot: 'bg-[#06C755]',
        border: 'border-green-300',
        lightBg: 'bg-green-50/70 text-green-800',
      };
    case 'facebook':
      return {
        badge: 'bg-[#0084FF] text-white',
        dot: 'bg-[#0084FF]',
        border: 'border-blue-300',
        lightBg: 'bg-blue-50/70 text-blue-800',
      };
    case 'instagram':
      return {
        badge: 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white',
        dot: 'bg-pink-500',
        border: 'border-pink-300',
        lightBg: 'bg-pink-50/70 text-pink-800',
      };
    case 'telegram':
      return {
        badge: 'bg-[#229ED9] text-white',
        dot: 'bg-[#229ED9]',
        border: 'border-sky-300',
        lightBg: 'bg-sky-50/70 text-sky-800',
      };
    default:
      return {
        badge: 'bg-teal-600 text-white',
        dot: 'bg-teal-500',
        border: 'border-teal-300',
        lightBg: 'bg-teal-50/70 text-teal-800',
      };
  }
}
