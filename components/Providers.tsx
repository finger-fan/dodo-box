'use client';

import { ThemeProvider } from 'next-themes';
import '@/lib/i18n';
import { ReactNode, useEffect } from 'react';
import { NostrProvider } from '@/contexts/NostrContext';
import UpdateChecker from '@/components/UpdateChecker';
import { initPrivacyFromPreference } from '@/lib/privacy-screen';
import { logger, createLogger } from '@/lib/logger';

const log = createLogger('Providers');

// 全局错误处理
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // ErrorEvent 有 message、filename、lineno 等属性
    const detail = event.message 
      ? `${event.message} (${event.filename}:${event.lineno}:${event.colno})`
      : `ErrorEvent: type=${event.type}, target=${event.target?.toString?.() || 'unknown'}`;
    log.error(`Uncaught error: ${detail}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    let detail = '';
    
    // 处理 ErrorEvent 或 Event 对象
    if (reason instanceof ErrorEvent) {
      detail = `ErrorEvent: ${reason.message} (${reason.filename}:${reason.lineno}:${reason.colno})`;
    } else if (reason instanceof Event) {
      // 普通 Event 对象，提取关键属性
      const eventDetail: Record<string, unknown> = {
        type: reason.type,
      };
      if ('message' in reason) eventDetail.message = String((reason as any).message);
      if ('target' in reason && reason.target) {
        eventDetail.target = reason.target.toString?.() || String(reason.target);
      }
      detail = `Event: ${JSON.stringify(eventDetail)}`;
    } else if (reason instanceof Error) {
      detail = `${reason.name}: ${reason.message}\n${reason.stack || ''}`;
    } else if (reason && typeof reason === 'object') {
      try {
        detail = JSON.stringify(reason, null, 2);
      } catch {
        detail = String(reason);
      }
    } else {
      detail = String(reason);
    }
    
    log.error(`Unhandled rejection: ${detail}`);
  });
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    log.info('App initialized');
    initPrivacyFromPreference();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NostrProvider>
        {children}
        <UpdateChecker />
      </NostrProvider>
    </ThemeProvider>
  );
}
