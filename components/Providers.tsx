'use client';

import { ThemeProvider } from 'next-themes';
import '@/lib/i18n';
import { ReactNode, useEffect } from 'react';
import { NostrProvider } from '@/contexts/NostrContext';
import UpdateChecker from '@/components/UpdateChecker';
import { initPrivacyFromPreference } from '@/lib/privacy-screen';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
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
