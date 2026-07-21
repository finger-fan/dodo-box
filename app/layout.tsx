import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'dodo-box',
  description: 'Privacy-focused multi-account messaging app.',
};

import { Providers } from '@/components/Providers';

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 min-h-screen selection:bg-emerald-100 selection:text-emerald-900" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
