import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tls.rider',
  appName: 'ThatLaundryShop',
  webDir: 'public',
  server: {
    url: 'https://app.thatlaundryshop.com/rider',
    cleartext: true
  }
};

export default config;
