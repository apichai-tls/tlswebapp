import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tls.billing',
  appName: 'TLS-BILL',
  webDir: 'public',
  server: {
    url: 'https://app.thatlaundryshop.com/billing',
    cleartext: true
  }
};

export default config;
