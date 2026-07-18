/**
 * @capacitor/privacy-screen 通信模块
 *
 * 全局默认禁止截屏（capacitor.config.ts 中 enable: true）。
 * 需要允许截屏的页面调用 disable()，离开时调用 enable() 恢复保护。
 *
 * 用法:
 *   import { enablePrivacy, disablePrivacy, isPrivacyEnabled } from '@/lib/privacy-screen';
 *
 *   // 进入允许截屏的页面
 *   useEffect(() => {
 *     disablePrivacy();
 *     return () => { enablePrivacy(); };
 *   }, []);
 */

import { PrivacyScreen } from '@capacitor/privacy-screen';

export async function enablePrivacy(): Promise<void> {
  await PrivacyScreen.enable({ android: { dimBackground: true } });
}

export async function disablePrivacy(): Promise<void> {
  await PrivacyScreen.disable();
}

export async function isPrivacyEnabled(): Promise<boolean> {
  const { enabled } = await PrivacyScreen.isEnabled();
  return enabled;
}