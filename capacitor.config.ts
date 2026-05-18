import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tls.rider',
  appName: 'ThatLaundryShop',
  webDir: 'public',
  server: {
    url: 'https://tls-test-xxxxx.a.run.app/rider', // TODO: เปลี่ยนเป็น URL จริงของระบบ Test
    cleartext: true
  }
};

export default config;
