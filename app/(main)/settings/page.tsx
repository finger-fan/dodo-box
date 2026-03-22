'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserCircle, LogOut, Globe, Moon, Shield,
  Trash2, Download, ChevronRight, Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import Toast from '@/components/ui/Toast';
import IdentityModal from '@/components/settings/IdentityModal';
import { cn, shortPubkey } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import { useMounted } from '@/hooks/use-mounted';

const TTL_OPTIONS = [
  { value: 600, labelKey: 'settings.ttl_10min' },
  { value: 1800, labelKey: 'settings.ttl_30min' },
  { value: 3600, labelKey: 'settings.ttl_1hour' },
  { value: 86400, labelKey: 'settings.ttl_1day' },
  { value: 1296000, labelKey: 'settings.ttl_15days' },
  { value: 2592000, labelKey: 'settings.ttl_30days' },
  { value: 0, labelKey: 'settings.ttl_permanent' },
];

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const { session, logout, adapter } = useNostr();

  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const mounted = useMounted();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [relays, setRelays] = useState(() => adapter.getRelays());
  const [messageTtl, setMessageTtl] = useState(() => {
    try {
      const savedTtl = typeof window !== 'undefined' ? localStorage.getItem('dodobox_message_ttl') : null;
      return savedTtl ? Number(savedTtl) : 2592000;
    } catch {
      return 2592000;
    }
  });
  const [isTtlOpen, setIsTtlOpen] = useState(false);

  const identities = session.vaultData?.identities || [];
  const activeIdentity = identities.find(i => i.pubkey === session.currentPubkey);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleTtlChange = (value: number) => {
    setMessageTtl(value);
    try {
      localStorage.setItem('dodobox_message_ttl', String(value));
    } catch (err) {
      console.warn('[Settings] Failed to save message TTL to localStorage:', err);
    }
    setIsTtlOpen(false);
  };

  const currentTtlLabel = TTL_OPTIONS.find(o => o.value === messageTtl)?.labelKey || 'settings.ttl_30days';

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem('dodobox_language', lang);
    } catch (err) {
      console.warn('[Settings] Failed to save language to localStorage:', err);
    }
  };

  const handleToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  if (!mounted) return null;

  const activeDisplay = activeIdentity
    ? activeIdentity.name
    : session.currentPubkey
    ? shortPubkey(session.currentPubkey)
    : 'No identity';

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-4 h-16 flex items-center justify-between">
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
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{activeDisplay}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('settings.switch_identity')}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold">{t('common.logout')}</span>
          </button>
        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.preferences')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="lang-switcher flex items-center justify-between p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.language')}</span>
              </div>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    i18n.language === 'en' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >EN</button>
                <button
                  onClick={() => handleLanguageChange('zh')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
                    i18n.language === 'zh' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
                  )}
                >ZH</button>
              </div>
            </div>
            <div className="theme-menu flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.theme')}</span>
              </div>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button onClick={() => setTheme('light')} className={cn("px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all", resolvedTheme === 'light' && theme !== 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>{t('settings.light')}</button>
                <button onClick={() => setTheme('system')} className={cn("px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all", theme === 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>{t('settings.system')}</button>
                <button onClick={() => setTheme('dark')} className={cn("px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all", resolvedTheme === 'dark' && theme !== 'system' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>{t('settings.dark')}</button>
              </div>
            </div>
          </div>
        </section>

        {/* Network & Relays */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">{t('settings.network_data')}</div>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="relay-list p-4 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.relays')}</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded uppercase">{relays.length} Configured</span>
              </div>
              <div className="space-y-2">
                {relays.map((relay) => (
                  <div key={relay} className="relay-item text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-lg flex items-center justify-between">
                    <span>{relay}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
            <div className="ttl-input-group p-4 border-b border-zinc-50 dark:border-zinc-800 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.message_ttl')}</span>
                </div>
                <button
                  onClick={() => setIsTtlOpen(!isTtlOpen)}
                  className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {t(currentTtlLabel)}
                </button>
              </div>
              {isTtlOpen && (
                <div className="absolute right-4 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
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
