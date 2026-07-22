'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useMounted } from '@/hooks/use-mounted';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Send, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, defaultAvatar, shortPubkey } from '@/lib/utils';
import { useMessages } from '@/hooks/nostr/use-messages';
import { isGapIndicator } from '@/lib/nostr/gap-detection';
import type { DeliveryStatus } from '@/lib/nostr/types';
import { useNostr } from '@/contexts/NostrContext';
import { useMaskSettings } from '@/hooks/use-mask-settings';
import MaskedText from '@/components/chat/MaskedText';

function PendingDot() {
  return (
    <span className="inline-flex items-center gap-[1px] ml-1">
      <span className="w-1 h-1 rounded-full bg-zinc-400 animate-pulse" />
    </span>
  );
}

function SendStatusIcon({ status, onRetry }: { status?: DeliveryStatus; onRetry?: () => void }) {
  if (!status) return null;
  if (status === 'pending') return <PendingDot />;
  if (status === 'failed') {
    const icon = <span className="text-[10px] leading-none font-bold text-red-400 ml-1">{'\u2717'}</span>;
    if (onRetry) {
      return (
        <button onClick={onRetry} className="inline-flex items-center hover:opacity-70" title="Tap to retry">
          {icon}
        </button>
      );
    }
    return <span className="inline-flex items-center">{icon}</span>;
  }
  // sent
  return (
    <span className="inline-flex items-center ml-1">
      <span className="text-[10px] leading-none font-bold text-emerald-400">{'\u2713'}</span>
    </span>
  );
}

export default function ChatView({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = use(params);
  const { adapter } = useNostr();
  const { chatItems, sendMessage, isSending, recoverGap, retrySend } = useMessages(id);
  const { seconds: maskSeconds, chars: maskChars } = useMaskSettings();
  const [msgInput, setMsgInput] = useState('');
  const mounted = useMounted();
  const [chatName, setChatName] = useState('');
  const [chatAvatar, setChatAvatar] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load contact display name: petname from contacts first, then kind:0 profile, then short pubkey
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const contacts = await adapter.getContacts();
      if (cancelled) return;
      const contact = contacts.find((c) => c.pubkey === id);
      if (contact) {
        setChatName(contact.name || shortPubkey(id));
        setChatAvatar(contact.avatar || defaultAvatar(id));
        return;
      }
      const profile = await adapter.getProfile(id);
      if (cancelled) return;
      if (profile) {
        setChatName(profile.displayName || profile.name || shortPubkey(id));
        setChatAvatar(profile.picture || defaultAvatar(id));
      } else {
        setChatName(shortPubkey(id));
        setChatAvatar(defaultAvatar(id));
      }
    })();
    return () => { cancelled = true; };
  }, [id, adapter]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatItems]);

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  const handleSend = async () => {
    if (!msgInput.trim() || isSending) return;
    const text = msgInput;
    setMsgInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(text);
  };

  if (!mounted) return null;

  return (
    <div className="chat-root flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Chat Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-12 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
        </button>
        {chatAvatar && (
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
            <Image src={chatAvatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="header-name font-bold text-zinc-900 dark:text-zinc-100 truncate">{chatName}</div>
          <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">{t('chat.online')}</div>
        </div>
      </header>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {chatItems.length === 0 ? (
          <div className="empty-chat flex flex-col items-center justify-center h-full opacity-20">
            <div className="empty-hint text-sm font-medium dark:text-zinc-400">{t('chat.no_messages')}</div>
          </div>
        ) : (
          <>
            <div className="date-sep flex justify-center">
              <span className="px-3 py-1 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('chat.today')}</span>
            </div>
            {chatItems.map((item) => {
              if (isGapIndicator(item)) {
                return (
                  <div key={item.id} className="flex justify-center my-2">
                    <button
                      onClick={() => recoverGap(item.gap)}
                      disabled={item.status === 'recovering'}
                      className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                    >
                      {item.status === 'recovering'
                        ? t('chat.recovering_messages')
                        : t('chat.missing_messages', { count: item.gap.missingCount })}
                    </button>
                  </div>
                );
              }
              const msg = item;
              return (
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
                      : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-tl-none border border-zinc-100 dark:border-zinc-800"
                  )}>
                    <MaskedText key={`mask-${maskSeconds}-${maskChars}`} text={msg.text} seconds={maskSeconds} chars={maskChars} />
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-1 px-1 inline-flex items-center">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.sender === 'me' && (
                      <SendStatusIcon
                        status={msg.sendStatus}
                        onRetry={msg.sendStatus === 'failed' ? () => retrySend(msg.id) : undefined}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-end gap-2 bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-2">
          <textarea
            ref={textareaRef}
            data-testid="message-input"
            value={msgInput}
            onChange={(e) => {
              setMsgInput(e.target.value);
              adjustTextareaHeight();
            }}
            placeholder={t('chat.type_message')}
            rows={1}
            className="msg-input flex-1 bg-transparent border-none focus:ring-0 text-sm text-zinc-900 dark:text-zinc-100 py-2 px-2 max-h-32 resize-none overflow-y-auto"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            data-testid="send-btn"
            onClick={handleSend}
            disabled={!msgInput.trim() || isSending}
            className={cn(
              "send-btn w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              msgInput.trim() && !isSending ? "active bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600"
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
