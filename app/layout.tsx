import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Doracle - Zero Nostr Onboarding',
  description: 'Privacy-focused multi-account messaging app.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans bg-zinc-50 text-zinc-900 min-h-screen selection:bg-emerald-100 selection:text-emerald-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
