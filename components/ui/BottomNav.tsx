'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Settings, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export default function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  const navItems = [
    { label: t('common.contacts'), icon: Users, href: '/messages' },
    { label: t('common.discover_tab'), icon: Compass, href: '/discover' },
    { label: t('common.settings'), icon: Settings, href: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-800 py-2 pb-4">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-full h-full transition-colors relative",
                isActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              )}
            >
              <Icon className={cn("w-6 h-6", isActive && "fill-emerald-600/10")} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
