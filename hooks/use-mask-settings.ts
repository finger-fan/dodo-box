'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_CHARSET_ID,
  DEFAULT_MASK_SECONDS,
  DEFAULT_MASK_SWIPE_ENABLED,
  DEFAULT_MASK_SWIPE_THRESHOLD,
  MASK_SETTINGS_EVENT,
  getCharsById,
  getMaskCharsetId,
  getMaskSeconds,
  getMaskSwipeEnabled,
  getMaskSwipeThreshold,
} from '@/lib/message-mask';

export interface MaskSettings {
  seconds: number;
  charsetId: string;
  chars: string;
  swipeEnabled: boolean;
  swipeThreshold: number;
}

/**
 * 响应式读取遮罩设置。挂载后从 localStorage 读取，
 * 监听同标签页自定义事件与跨标签页 storage 事件以实时更新。
 */
export function useMaskSettings(): MaskSettings {
  const [settings, setSettings] = useState<MaskSettings>({
    seconds: DEFAULT_MASK_SECONDS,
    charsetId: DEFAULT_CHARSET_ID,
    chars: getCharsById(DEFAULT_CHARSET_ID),
    swipeEnabled: DEFAULT_MASK_SWIPE_ENABLED,
    swipeThreshold: DEFAULT_MASK_SWIPE_THRESHOLD,
  });

  useEffect(() => {
    const read = () => {
      const charsetId = getMaskCharsetId();
      setSettings({
        seconds: getMaskSeconds(),
        charsetId,
        chars: getCharsById(charsetId),
        swipeEnabled: getMaskSwipeEnabled(),
        swipeThreshold: getMaskSwipeThreshold(),
      });
    };
    read();
    window.addEventListener(MASK_SETTINGS_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(MASK_SETTINGS_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return settings;
}
