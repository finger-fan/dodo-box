'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { cn } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useNostr();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!session.isAuthenticated) {
      router.push('/login');
    } else {
      requestAnimationFrame(() => {
        setIsReady(true);
      });
    }
  }, [router, session.isAuthenticated]);

  if (!isReady) return null;

  const isChatDetail = pathname.startsWith('/messages/') && pathname !== '/messages';

  return (
    <div className={cn("min-h-screen bg-zinc-50 dark:bg-zinc-950", !isChatDetail && "pb-20")}>
      <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-sm relative">
        {children}
        {!isChatDetail && <BottomNav />}
      </div>
    </div>
  );
}
