'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useMounted } from '@/hooks/use-mounted';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, defaultAvatar, shortPubkey } from '@/lib/utils';
import { useMessages } from '@/hooks/nostr/use-messages';
import { isGapIndicator } from '@/lib/nostr/gap-detection';
import type { DeliveryStatus } from '@/lib/nostr/types';
import { useNostr } from '@/contexts/NostrContext';
import { useMaskSettings } from '@/hooks/use-mask-settings';
import MaskedText from '@/components/chat/MaskedText';
import { createLogger } from '@/lib/logger';

const log = createLogger('ChatView');

// 诊断埋点(临时):模块加载即记录,证明 JS chunk 已被加载执行
if (typeof window !== 'undefined') {
  log.info(`ChatView module evaluated, path=${window.location.pathname}`);
}

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

export default function ChatView() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('peer') ?? '';
  const { adapter, session } = useNostr();
  const { chatItems, sendMessage, isSending, recoverGap, retrySend, loadOlder, hasMore, isLoadingOlder } = useMessages(id);
  const { seconds: maskSeconds, chars: maskChars, swipeEnabled, swipeThreshold } = useMaskSettings();
  const [msgInput, setMsgInput] = useState('');
  const mounted = useMounted();
  const [chatName, setChatName] = useState('');
  const [chatAvatar, setChatAvatar] = useState('');
  const [scrollBumpedAt, setScrollBumpedAt] = useState<number | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Anchor captured before a history page fetch, used to keep the scroll
  // position stable when older messages are prepended at the top.
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number; firstId?: string } | null>(null);
  // Track user scroll gestures so only actual swipes (>= swipeThreshold px) bump
  // the per-message mask timer; simple taps on the scroll area do not.
  const gestureStartScrollRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const hasBumpedRef = useRef(false);
  const gestureResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle user-scroll bumps so we do not re-render on every touchmove/wheel frame.
  const lastBumpRef = useRef(0);

  // 缺少 peer 参数时退回聊天列表
  useEffect(() => {
    if (!id) {
      log.warn('no peer param, redirecting to /messages');
      router.replace('/messages');
    }
  }, [id, router]);

  // 诊断埋点(临时):记录每次渲染,证明组件已进入 React 渲染流程
  log.debug(`ChatView render: id=${id?.slice(0, 16)}..., mounted=${mounted}, isAuthenticated=${session.isAuthenticated}, chatItems=${chatItems?.length ?? 0}`);

  // 诊断埋点(临时):捕获整页卸载信号。客户端路由跳转不会触发
  // pagehide/beforeunload,只有整页重载/硬跳转才会——这是区分
  // "ChatView 内崩溃" 与 "路由阶段硬跳转" 的关键证据
  useEffect(() => {
    const onPageHide = (e: PageTransitionEvent) => {
      log.warn(`pagehide fired: persisted=${e.persisted}, path=${window.location.pathname}`);
    };
    const onBeforeUnload = () => {
      log.warn(`beforeunload fired, path=${window.location.pathname}`);
    };
    const onVisibilityChange = () => {
      log.debug(`visibilitychange: ${document.visibilityState}`);
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Lifecycle logging
  useEffect(() => {
    try {
      log.info(`ChatView mounted with id=${id?.slice(0, 16)}..., isAuthenticated=${session.isAuthenticated}`);
      log.debug(`chatItems count: ${chatItems?.length || 0}, isSending: ${isSending}`);
    } catch (err) {
      log.error('ChatView mount effect failed', err);
    }
    return () => log.debug('ChatView unmounted');
  }, [id, session.isAuthenticated]);

  // Log when chatItems changes
  useEffect(() => {
    if (chatItems && chatItems.length > 0) {
      log.debug(`chatItems updated: ${chatItems.length} items, first: ${chatItems[0]?.id?.slice(0, 8)}...`);
    }
  }, [chatItems]);

  // Load contact display name: petname from contacts first, then kind:0 profile, then short pubkey
  useEffect(() => {
    if (!id) return;
    log.debug(`loading profile for ${id.slice(0, 16)}..., adapter exists: ${!!adapter}`);
    let cancelled = false;
    (async () => {
      try {
        log.debug('fetching contacts...');
        const contacts = await adapter.getContacts();
        if (cancelled) return;
        log.debug(`got ${contacts?.length || 0} contacts`);
        const contact = contacts.find((c) => c.pubkey === id);
        if (contact) {
          log.debug(`found contact: ${contact.name}`);
          setChatName(contact.name || shortPubkey(id));
          setChatAvatar(contact.avatar || defaultAvatar(id));
          return;
        }
        log.debug('contact not found, fetching profile...');
        const profile = await adapter.getProfile(id);
        if (cancelled) return;
        if (profile) {
          log.debug(`got profile: ${profile.displayName || profile.name}`);
          setChatName(profile.displayName || profile.name || shortPubkey(id));
          setChatAvatar(profile.picture || defaultAvatar(id));
        } else {
          log.debug('profile not found, using short pubkey');
          setChatName(shortPubkey(id));
          setChatAvatar(defaultAvatar(id));
        }
      } catch (err) {
        log.error('Failed to load contact/profile', err);
      }
    })();
    return () => { cancelled = true; };
  }, [id, adapter]);

  // Auto-scroll to bottom on new messages (skipped while a history prepend
  // is in flight — the compensation effect below owns the scroll position then)
  useEffect(() => {
    try {
      if (prependAnchorRef.current) return;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      log.error('scrollIntoView failed', err);
    }
  }, [chatItems]);

  // After older messages are prepended, compensate scrollTop by the added
  // height so the viewport does not jump
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!anchor) return;
    const el = scrollContainerRef.current;
    // First item unchanged → no prepend happened yet (e.g. bottom append)
    if (!el || chatItems[0]?.id === anchor.firstId) return;
    el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
    prependAnchorRef.current = null;
  }, [chatItems]);

  // If a page fetch finished without prepending (history exhausted), drop the
  // pending anchor so auto-scroll-to-bottom works again for new messages
  useEffect(() => {
    if (!isLoadingOlder) prependAnchorRef.current = null;
  }, [isLoadingOlder]);

  const bumpMaskTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastBumpRef.current < 100) return;
    lastBumpRef.current = now;
    setScrollBumpedAt(now);
  }, []);

  const resetGesture = useCallback(() => {
    gestureStartScrollRef.current = null;
    wheelDeltaRef.current = 0;
    hasBumpedRef.current = false;
    gestureResetTimerRef.current = null;
  }, []);

  const scheduleGestureReset = useCallback(() => {
    if (gestureResetTimerRef.current) clearTimeout(gestureResetTimerRef.current);
    gestureResetTimerRef.current = setTimeout(resetGesture, 150);
  }, [resetGesture]);

  // WeChat-style stepped loading: hitting the top fetches the next older page.
  const handleMessagesScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (el.scrollTop <= 40 && hasMore && !isLoadingOlder) {
      prependAnchorRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        firstId: chatItems[0]?.id,
      };
      loadOlder();
    }

    // Touch swipe threshold check: onScroll fires after the browser scrolls,
    // so we compare the current scrollTop with the one captured at touchStart.
    if (swipeEnabled && gestureStartScrollRef.current !== null && !hasBumpedRef.current) {
      const delta = Math.abs(el.scrollTop - gestureStartScrollRef.current);
      if (delta >= swipeThreshold) {
        bumpMaskTimer();
        hasBumpedRef.current = true;
      }
    }
  }, [hasMore, isLoadingOlder, chatItems, loadOlder, swipeEnabled, swipeThreshold, bumpMaskTimer]);

  const handleTouchStart = useCallback(() => {
    gestureStartScrollRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    wheelDeltaRef.current = 0;
    hasBumpedRef.current = false;
    if (gestureResetTimerRef.current) {
      clearTimeout(gestureResetTimerRef.current);
      gestureResetTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    scheduleGestureReset();
  }, [scheduleGestureReset]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!swipeEnabled || hasBumpedRef.current) return;
    wheelDeltaRef.current += Math.abs(e.deltaY);
    if (wheelDeltaRef.current >= swipeThreshold) {
      bumpMaskTimer();
      hasBumpedRef.current = true;
    }
    scheduleGestureReset();
  }, [swipeEnabled, swipeThreshold, bumpMaskTimer, scheduleGestureReset]);

  // Clean up the gesture reset timer when the view unmounts.
  useEffect(() => {
    return () => {
      if (gestureResetTimerRef.current) {
        clearTimeout(gestureResetTimerRef.current);
      }
    };
  }, []);

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
    try {
      await sendMessage(text);
    } catch (err) {
      log.error('handleSend failed', err);
    }
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
          <div className="w-8 h-8 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
            <Image src={chatAvatar} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="header-name font-bold text-zinc-900 dark:text-zinc-100 truncate">{chatName}</div>
        </div>
        <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">{t('chat.online')}</div>
      </header>

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {isLoadingOlder && (
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('chat.loading_older')}</span>
          </div>
        )}
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
                    "bubble px-3 py-2 rounded-2xl text-sm shadow-sm",
                    msg.sender === 'me'
                      ? "mine bg-emerald-600 text-white rounded-tr-none"
                      : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-tl-none border border-zinc-100 dark:border-zinc-800"
                  )}>
                    <MaskedText text={msg.text} seconds={maskSeconds} chars={maskChars} scrollBumpedAt={scrollBumpedAt} />
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
