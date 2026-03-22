import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'box.dodo.app',
  appName: 'DodoBox',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
