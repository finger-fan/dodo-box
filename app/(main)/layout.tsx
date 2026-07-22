'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import IdentityOnboarding from '@/components/settings/IdentityOnboarding';
import { cn } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, adapterMode } = useNostr();
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

  const hasActiveIdentity = (session.vaultData?.identities ?? []).some(
    (i) => i.pubkey === session.currentPubkey
  );
  const needsIdentity =
    adapterMode !== 'mock-telegram' &&
    session.vaultData !== null &&
    !hasActiveIdentity;

  if (needsIdentity) {
    return <IdentityOnboarding />;
  }

  // 解析 pathname: /messages 或 /messages/ 是列表页，/messages/xxx 是聊天详情页
  const pathParts = pathname.split('/').filter(Boolean);
  const isChatDetail = pathParts[0] === 'messages' && pathParts.length > 1 && pathParts[1] !== '';
  const showPathName = false;
  const showRuler = true;

  return (
    <div className={cn("min-h-screen bg-zinc-50 dark:bg-zinc-950", !isChatDetail && "pb-20")}>
      <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-zinc-950 shadow-sm relative">
        {children}
      </div>
      {!isChatDetail && <BottomNav />}
      {/* Debug: show pathname */}
      { showPathName && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
        pathname: {pathname}
      </div>)}
      {/* Debug ruler - 12 blocks from bottom */}
      { showRuler && (
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 flex flex-col-reverse pointer-events-none z-50">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
          <div key={n} className="w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center font-bold border border-white">
            {n}
          </div>
        ))}
      </div>)}
    </div>
  );
}
