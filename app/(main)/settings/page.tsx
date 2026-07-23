'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserCircle, LogOut, Shield,
  Trash2, Download, ChevronRight, ChevronDown, Clock,
  RefreshCw, RotateCcw, Loader2,
  EyeOff, Type,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Toast from '@/components/ui/Toast';
import IdentityModal from '@/components/settings/IdentityModal';
import GeneralSettings from '@/components/settings/GeneralSettings';
import { cn } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import { useMounted } from '@/hooks/use-mounted';
import { store, StorageKey } from '@/lib/storage';
import { useUpdater } from '@/hooks/use-updater';
import { Capacitor } from '@capacitor/core';
import { isContactCacheEnabled, setContactCacheEnabled } from '@/lib/nostr/contact-cache';
import { isScreenshotAllowed, setScreenshotAllowed } from '@/lib/privacy-screen';
import {
  MASK_CHARSETS,
  MASK_SECONDS_OPTIONS,
  getMaskCharsetId,
  getMaskSeconds,
  setMaskCharsetId,
  setMaskSeconds,
} from '@/lib/message-mask';
import type { AdapterMode } from '@/lib/nostr';

const TTL_OPTIONS = [
  { value: 600, labelKey: 'settings.ttl_10min' },
  { value: 1800, labelKey: 'settings.ttl_30min' },
  { value: 3600, labelKey: 'settings.ttl_1hour' },
  { value: 86400, labelKey: 'settings.ttl_1day' },
  { value: 1296000, labelKey: 'settings.ttl_15days' },
  { value: 2592000, labelKey: 'settings.ttl_30days' },
  { value: 0, labelKey: 'settings.ttl_permanent' },
];

const MASK_SECONDS_LABELS: Record<number, string> = {
  5: 'settings.mask_5s',
  10: 'settings.mask_10s',
  30: 'settings.mask_30s',
  0: 'settings.mask_off',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, adapterMode, setAdapterMode, logout } = useNostr();

  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const mounted = useMounted();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [messageTtl, setMessageTtl] = useState(() => {
    if (typeof window === 'undefined') return 2592000;
    return store.get(StorageKey.MESSAGE_TTL, 2592000);
  });
  const [isTtlOpen, setIsTtlOpen] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(() => isContactCacheEnabled());
  const [screenshotAllowed, setScreenshotAllowedState] = useState(() => isScreenshotAllowed());

  const [maskSeconds, setMaskSecondsState] = useState(() => getMaskSeconds());
  const [maskCharsetId, setMaskCharsetIdState] = useState(() => getMaskCharsetId());
  const [isMaskSecondsOpen, setIsMaskSecondsOpen] = useState(false);
  const [isMaskCharsetOpen, setIsMaskCharsetOpen] = useState(false);
  const ttlRef = useRef<HTMLDivElement>(null);
  const maskSecondsRef = useRef<HTMLDivElement>(null);
  const maskCharsetRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      console.log('[handleClickOutside] triggered', {
        target: e.target,
        ttlRef: !!ttlRef.current,
        maskSecondsRef: !!maskSecondsRef.current,
        maskCharsetRef: !!maskCharsetRef.current,
        isTtlOpen,
        isMaskSecondsOpen,
        isMaskCharsetOpen,
      });
      if (ttlRef.current && !ttlRef.current.contains(e.target as Node)) {
        console.log('[handleClickOutside] closing TTL');
        setIsTtlOpen(false);
      }
      if (maskSecondsRef.current && !maskSecondsRef.current.contains(e.target as Node)) {
        console.log('[handleClickOutside] closing maskSeconds');
        setIsMaskSecondsOpen(false);
      }
      if (maskCharsetRef.current && !maskCharsetRef.current.contains(e.target as Node)) {
        console.log('[handleClickOutside] closing maskCharset');
        setIsMaskCharsetOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isTtlOpen, isMaskSecondsOpen, isMaskCharsetOpen]);

  const updater = useUpdater();
  const isNative = mounted && Capacitor.isNativePlatform();

  const identities = session.vaultData?.identities || [];
  const activeIdentity = identities.find(i => i.pubkey === session.currentPubkey);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleTtlChange = (value: number) => {
    setMessageTtl(value);
    store.set(StorageKey.MESSAGE_TTL, value);
    setIsTtlOpen(false);
  };

  const currentTtlLabel = TTL_OPTIONS.find(o => o.value === messageTtl)?.labelKey || 'settings.ttl_30days';

  const handleMaskSecondsChange = (value: number) => {
    setMaskSecondsState(value);
    setMaskSeconds(value);
    setIsMaskSecondsOpen(false);
  };

  const handleMaskCharsetChange = (id: string) => {
    setMaskCharsetIdState(id);
    setMaskCharsetId(id);
    setIsMaskCharsetOpen(false);
  };

  const currentMaskSecondsLabel = MASK_SECONDS_LABELS[maskSeconds] ?? 'settings.mask_off';
  const currentMaskCharsetLabel = MASK_CHARSETS.find(c => c.id === maskCharsetId)?.labelKey || MASK_CHARSETS[0].labelKey;

  const handleToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleAdapterModeChange = (mode: AdapterMode) => {
    setAdapterMode(mode);
    // After switching, redirect to login for real mode, or stay for mock
    if (mode === 'mock-telegram') {
      handleToast('Switched to Telegram Mock mode', 'success');
    } else {
      handleToast('Switched to Nostr Real mode — please login again', 'success');
    }
  };

  if (!mounted) return null;

  const accountDisplay = session.username || t('settings.account_only', 'Account');

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-12 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">{t('common.settings')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Identity Section */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.identity_management')}</div>
          <button
            onClick={() => setIsIdentityModalOpen(true)}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm hover:border-emerald-500 transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <UserCircle className="w-7 h-7" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{accountDisplay}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeIdentity ? `${t('settings.active_identity')}: ${activeIdentity.name}` : t('settings.switch_identity')}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
          </button>

        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.preferences')}</div>
          <GeneralSettings onToast={handleToast} />
        </section>

        {/* Display */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.display', 'Display')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm rounded-3xl">
            <div className="p-4 border-b border-zinc-50 dark:border-zinc-800 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <EyeOff className="w-5 h-5 text-zinc-400" />
                  <div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.mask_reveal_time')}</span>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 max-w-[200px]">{t('settings.mask_desc')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setIsMaskSecondsOpen(!isMaskSecondsOpen); setIsMaskCharsetOpen(false); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {t(currentMaskSecondsLabel)}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isMaskSecondsOpen && "rotate-180")} />
                </button>
              </div>
              {isMaskSecondsOpen && (
                <div ref={maskSecondsRef} className="absolute right-4 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                  {MASK_SECONDS_OPTIONS.map((value) => (
                    <button
                      key={value}
                      onClick={() => handleMaskSecondsChange(value)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors",
                        maskSeconds === value
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      )}
                    >
                      {t(MASK_SECONDS_LABELS[value] ?? 'settings.mask_off')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Type className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.mask_charset')}</span>
                </div>
                <button
                  onClick={() => { setIsMaskCharsetOpen(!isMaskCharsetOpen); setIsMaskSecondsOpen(false); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {t(currentMaskCharsetLabel)}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isMaskCharsetOpen && "rotate-180")} />
                </button>
              </div>
              {isMaskCharsetOpen && (
                <div ref={maskCharsetRef} className="absolute right-4 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                  {MASK_CHARSETS.map((cs) => (
                    <button
                      key={cs.id}
                      onClick={() => handleMaskCharsetChange(cs.id)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors",
                        maskCharsetId === cs.id
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      )}
                    >
                      {t(cs.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.privacy')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-zinc-400" />
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.contact_cache')}</span>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 max-w-[200px]">{t('settings.contact_cache_desc')}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = !cacheEnabled;
                  setContactCacheEnabled(next);
                  setCacheEnabled(next);
                }}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors",
                  cacheEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                  cacheEnabled ? "left-[18px]" : "left-0.5"
                )} />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <EyeOff className="w-5 h-5 text-zinc-400" />
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.allow_screenshot')}</span>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 max-w-[200px]">{t('settings.allow_screenshot_desc')}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = !screenshotAllowed;
                  setScreenshotAllowed(next);
                  setScreenshotAllowedState(next);
                }}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors",
                  screenshotAllowed ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                  screenshotAllowed ? "left-[18px]" : "left-0.5"
                )} />
              </button>
            </div>
            <div className="ttl-input-group p-4 border-b border-zinc-50 dark:border-zinc-800 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.message_ttl')}</span>
                </div>
                <button
                  onClick={() => setIsTtlOpen(!isTtlOpen)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {t(currentTtlLabel)}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isTtlOpen && "rotate-180")} />
                </button>
              </div>
              {isTtlOpen && (
                <div ref={ttlRef} className="absolute right-4 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                  {TTL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleTtlChange(option.value)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors",
                        messageTtl === option.value
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      )}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 flex gap-2">
              <button disabled title={t('settings.coming_soon')} className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Download className="w-4 h-4" /> {t('settings.export')}
              </button>
              <button disabled title={t('settings.coming_soon')} className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Trash2 className="w-4 h-4" /> {t('settings.clear')}
              </button>
            </div>
          </div>
        </section>

        {/* App Update (native only) */}
        {isNative && (
          <section className="space-y-3">
            <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('updater.section_title')}</div>
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-50 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-zinc-400" />
                    <div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('updater.current_version')}</span>
                      <span className="ml-2 text-xs font-mono text-zinc-500">{process.env.NEXT_PUBLIC_APP_VERSION ?? '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 flex gap-2">
                <button
                  onClick={updater.check}
                  disabled={updater.checking}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                >
                  {updater.checking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('updater.checking')}</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> {t('updater.check_update')}</>
                  )}
                </button>
                <button
                  onClick={updater.reset}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> {t('updater.reset_builtin')}
                </button>
              </div>
              {updater.error && (
                <div className="px-4 pb-4">
                  <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded-lg">{updater.error}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Logout Button */}
        <div className="mt-8">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold">{t('common.logout')}</span>
          </button>
        </div>
      </div>

      <IdentityModal
        isOpen={isIdentityModalOpen}
        onClose={() => setIsIdentityModalOpen(false)}
        onToast={handleToast}
      />

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
