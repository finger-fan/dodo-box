'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { maskText } from '@/lib/message-mask';

interface MaskedTextProps {
  text: string;
  seconds: number;
  chars: string;
  scrollBumpedAt?: number;
}

/**
 * 聊天气泡文本：明文显示 `seconds` 秒后自动替换为随机遮罩字符。
 * 点击恢复明文并重新计时。seconds <= 0 表示不遮罩（明文常驻）。
 * 计时为组件内部机制，不显示倒计时。
 *
 * 传入 `scrollBumpedAt` 时，该时间戳变化会重置当前消息的遮罩计时
 * （用于用户上下滑动时延长可见时间）。自动滚动等程序化滚动不应
 * 触发该时间戳变化。
 */
export default function MaskedText({ text, seconds, chars, scrollBumpedAt }: MaskedTextProps) {
  const { t } = useTranslation();
  const enabled = seconds > 0;
  const [revealed, setRevealed] = useState(true);
  const [timerKey, setTimerKey] = useState(0);
  const [lastBump, setLastBump] = useState(scrollBumpedAt);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const masked = useMemo(() => maskText(text, chars), [text, chars]);

  // Adjust state in response to a prop change (scrollBumpedAt) during render.
  // This avoids calling setState synchronously inside an effect body.
  if (enabled && scrollBumpedAt !== lastBump) {
    setLastBump(scrollBumpedAt);
    setRevealed(true);
    setTimerKey((k) => k + 1);
  }

  // Schedule the mask timeout. timerKey changes on mount, seconds change, and
  // user scroll bumps, so the timer is always aligned with the current window.
  useEffect(() => {
    if (!enabled) return;
    timerRef.current = setTimeout(() => setRevealed(false), seconds * 1000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, seconds, timerKey]);

  if (!enabled) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const handleClick = () => {
    setRevealed(true);
    setTimerKey((k) => k + 1);
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
      className="cursor-pointer"
    >
      {revealed ? (
        <span data-testid="masked-text-visible" className="whitespace-pre-wrap break-words">{text}</span>
      ) : (
        <span className="relative inline-block">
          {/* 透明原文占位：决定气泡宽度和行数 */}
          <span className="whitespace-pre-wrap break-words select-none text-transparent">
            {text}
          </span>
          {/* 遮罩层覆盖：同宽同高，超出的字符截断 */}
          <span data-testid="masked-text-visible" className="absolute inset-0 whitespace-pre-wrap break-words overflow-hidden select-none">
            {masked}
          </span>
        </span>
      )}
    </span>
  );
}
