'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { maskText } from '@/lib/message-mask';

interface MaskedTextProps {
  text: string;
  seconds: number;
  chars: string;
}

/**
 * 聊天气泡文本：明文显示 `seconds` 秒后自动替换为随机遮罩字符。
 * 点击恢复明文并重新计时。seconds <= 0 表示不遮罩（明文常驻）。
 * 计时为组件内部机制，不显示倒计时。
 * 
 * 注意：父组件应使用 key 属性在 text/seconds/chars 变化时强制重新挂载，
 * 以确保 revealed 状态重置为 true。
 */
export default function MaskedText({ text, seconds, chars }: MaskedTextProps) {
  const { t } = useTranslation();
  const enabled = seconds > 0;
  const [revealed, setRevealed] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const masked = useMemo(() => maskText(text, chars), [text, chars]);

  // 仅在启用遮罩时启动计时器；仅调度超时，不在 effect 体内调用 setState
  useEffect(() => {
    if (!enabled) return;
    timerRef.current = setTimeout(() => setRevealed(false), seconds * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, seconds]);

  if (!enabled) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const handleClick = () => {
    setRevealed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), seconds * 1000);
  };

  return (
    <span
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={revealed ? undefined : t('settings.mask_tap_reveal')}
      aria-label={revealed ? text : t('settings.mask_tap_reveal')}
      className={revealed
        ? 'whitespace-pre-wrap break-words cursor-pointer'
        : 'whitespace-pre-wrap break-words cursor-pointer select-none'}
    >
      {revealed ? text : masked}
    </span>
  );
}
