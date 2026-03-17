'use client';

import { ThemeProvider } from 'next-themes';
import '@/lib/i18n';
import { ReactNode } from 'react';
import { NostrProvider } from '@/contexts/NostrContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NostrProvider>
        {children}
      </NostrProvider>
    </ThemeProvider>
  );
}
