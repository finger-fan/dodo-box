'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChats } from '@/hooks/nostr/use-chats';
import { useMounted } from '@/hooks/use-mounted';

export default function MessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { chats } = useChats();
  const mounted = useMounted();

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('common.messages')}</h1>
        <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
          <Search className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <button
            key={chat.pubkey}
            data-testid="chat-item"
            onClick={() => router.push(`/messages/${chat.pubkey}`)}
            className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors border-b border-zinc-50 dark:border-zinc-900"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 relative">
                <Image src={chat.avatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
              </div>
              {chat.unread > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-zinc-950">
                  {chat.unread}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{chat.name}</span>
                <span className="text-[10px] font-medium text-zinc-400">{chat.time}</span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{chat.lastMsg}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
