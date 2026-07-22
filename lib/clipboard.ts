import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';

export async function copyToClipboard(text: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
      return true;
    } catch (err) {
      console.error('Clipboard write failed (native):', err);
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Clipboard write failed (web):', err);
    return false;
  }
}