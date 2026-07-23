'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import IdentityOnboarding from '@/components/settings/IdentityOnboarding';
import UnlockScreen from '@/components/auth/UnlockScreen';
import { cn } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import { createLogger } from '@/lib/logger';

const log = createLogger('MainLayout');

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, adapterMode } = useNostr();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!session.isAuthenticated) {
      log.debug('nav to login');
      router.push('/login');
    } else {
      requestAnimationFrame(() => {
        setIsReady(true);
      });
    }
  }, [router, session.isAuthenticated]);

  if (!isReady) return null;

  // 页面重载后私钥丢失,会话处于锁定状态——显示解锁屏而非踢回登录页
  if (session.locked) {
    return <UnlockScreen />;
  }

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

  // /chat 是聊天详情页(查询参数形式,避免静态导出下动态路由导致整页重载)
  // 注意这个在手机端是后面多一个 /, 在 PC 的 web 端是没有最后这个 /
  const isChatDetail = pathname === '/chat' || pathname === '/chat/';
  const showPathName =  false;
  const showRuler = false;

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
