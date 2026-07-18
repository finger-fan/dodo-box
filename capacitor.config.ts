import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'box.dodo.app',
  appName: 'DodoBox',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PrivacyScreen: {
      enable: true,
    },
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
};

export default config;
