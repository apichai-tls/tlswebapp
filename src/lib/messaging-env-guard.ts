/**
 * Prevents Local (development) and Test/Staging environments from connecting to live
 * WhatsApp (Baileys QR Bridge / Meta Cloud API) or LINE Messaging API.
 *
 * Why:
 * 1. Prevents Local/Test from hijacking Production's WhatsApp QR session (440 connectionReplaced).
 * 2. Prevents accidentally sending test messages to real customers via WhatsApp or LINE.
 * 3. Prevents Local/Test from running background LINE follower syncs or touching Production DB auth backups.
 *
 * Set ALLOW_LIVE_MESSAGING_IN_NON_PROD=true in .env to temporarily override if needed.
 */
export function isLiveMessagingDisabled(): boolean {
  if (process.env.ALLOW_LIVE_MESSAGING_IN_NON_PROD === 'true') {
    return false;
  }
  const isDev = process.env.NODE_ENV !== 'production';
  const isTestOrStaging =
    process.env.APP_ENV === 'test' ||
    process.env.APP_ENV === 'staging' ||
    Boolean(process.env.DATABASE_URL?.includes('/tls_test')) ||
    Boolean(process.env.DIRECT_URL?.includes('/tls_test'));
  return isDev || isTestOrStaging;
}

export function getLiveMessagingDisabledReason(channel: 'WhatsApp' | 'LINE'): string {
  const envLabel =
    process.env.APP_ENV === 'test' ||
    process.env.DATABASE_URL?.includes('/tls_test') ||
    process.env.DIRECT_URL?.includes('/tls_test')
      ? 'Test ENV'
      : process.env.APP_ENV === 'staging'
      ? 'Staging ENV'
      : 'Local (Development)';
  return `${channel} live connection is disabled on ${envLabel} to protect Production session & customers.`;
}
