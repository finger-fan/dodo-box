'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Send, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOCK_CHATS, Message } from '@/lib/mock-data';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const chat = MOCK_CHATS.find(c => c.id === id);
  
  const [msgInput, setMsgInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!chat) {
      router.push('/messages');
      return;
    }

    requestAnimationFrame(() => {
      setMessages([
        { id: '1', text: 'Hey there!', sender: 'them', timestamp: new Date(Date.now() - 3600000) },
        { id: '2', text: 'Hello! How are you?', sender: 'me', timestamp: new Date(Date.now() - 3000000) },
      ]);
    });
  }, [chat, router]);

  const handleSend = () => {
    if (!msgInput.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      text: msgInput,
      sender: 'me',
      timestamp: new Date()
    };
    setMessages([...messages, newMsg]);
    setMsgInput('');
  };

  if (!chat) return null;

  return (
    <div className="chat-root flex flex-col h-screen bg-zinc-50">
      {/* Chat Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-4 h-16 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-zinc-100 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6 text-zinc-600" />
        </button>
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-100 relative">
          <Image src={chat.avatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="header-name font-bold text-zinc-900 truncate">{chat.name}</div>
          <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Online</div>
        </div>
      </header>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="empty-chat flex flex-col items-center justify-center h-full opacity-20">
            <div className="empty-hint text-sm font-medium">No messages yet</div>
          </div>
        ) : (
          <>
            <div className="date-sep flex justify-center">
              <span className="px-3 py-1 bg-zinc-200/50 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Today</span>
            </div>
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={cn(
                  "flex flex-col max-w-[80%]",
                  msg.sender === 'me' ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "bubble px-4 py-2.5 rounded-2xl text-sm shadow-sm",
                  msg.sender === 'me' 
                    ? "mine bg-emerald-600 text-white rounded-tr-none" 
                    : "bg-white text-zinc-800 rounded-tl-none border border-zinc-100"
                )}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-zinc-100">
        <div className="flex items-end gap-2 bg-zinc-100 rounded-2xl p-2">
          <textarea
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="msg-input flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-2 max-h-32 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!msgInput.trim()}
            className={cn(
              "send-btn w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              msgInput.trim() ? "active bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-zinc-200 text-zinc-400"
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
