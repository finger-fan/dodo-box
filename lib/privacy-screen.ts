/**
 * @capacitor/privacy-screen 通信模块
 *
 * 通过 localStorage 存储用户偏好，默认禁止截屏。
 * 需要允许截屏的页面调用 disable()，离开时调用 enable() 恢复保护。
 */

import { PrivacyScreen } from '@capacitor/privacy-screen';

const SCREENSHOT_ALLOWED_KEY = 'dodobox_allow_screenshot';

/**
 * 获取用户是否允许截屏的偏好设置
 * @returns true = 允许截屏, false = 禁止截屏（默认）
 */
export function isScreenshotAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SCREENSHOT_ALLOWED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * 设置用户是否允许截屏的偏好
 * @param allowed true = 允许截屏, false = 禁止截屏
 */
export function setScreenshotAllowed(allowed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SCREENSHOT_ALLOWED_KEY, String(allowed));
  } catch {
    // non-critical
  }
}

/**
 * 启用截屏保护（禁止截屏）
 */
export async function enablePrivacy(): Promise<void> {
  await PrivacyScreen.enable({ android: { dimBackground: true } });
}

/**
 * 禁用截屏保护（允许截屏）
 */
export async function disablePrivacy(): Promise<void> {
  await PrivacyScreen.disable();
}

/**
 * 检查截屏保护是否启用
 */
export async function isPrivacyEnabled(): Promise<boolean> {
  const { enabled } = await PrivacyScreen.isEnabled();
  return enabled;
}

/**
 * 根据用户偏好初始化截屏保护
 * 应在应用启动时调用
 */
export async function initPrivacyFromPreference(): Promise<void> {
  const allowed = isScreenshotAllowed();
  if (allowed) {
    await disablePrivacy();
  } else {
    await enablePrivacy();
  }
}