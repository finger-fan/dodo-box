'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { MOCK_CHATS } from '@/lib/mock-data';

export default function MessagesPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900">Messages</h1>
        <button className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
          <Search className="w-5 h-5 text-zinc-500" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {MOCK_CHATS.map((chat) => (
          <button
            key={chat.id}
            onClick={() => router.push(`/messages/${chat.id}`)}
            className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 transition-colors border-b border-zinc-50"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-100 relative">
                <Image src={chat.avatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
              </div>
              {chat.unread > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                  {chat.unread}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-zinc-900">{chat.name}</span>
                <span className="text-[10px] font-medium text-zinc-400">{chat.time}</span>
              </div>
              <p className="text-sm text-zinc-500 truncate">{chat.lastMsg}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
