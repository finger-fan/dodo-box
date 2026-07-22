'use client';

import React, { useState, useEffect } from 'react';
import { useMounted } from '@/hooks/use-mounted';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Shield, UserPlus, ArrowRight, User, Lock, Settings as SettingsIcon, X } from 'lucide-react';
import Toast from '@/components/ui/Toast';
import GeneralSettings from '@/components/settings/GeneralSettings';
import { useNostr } from '@/contexts/NostrContext';
import { useTranslation } from 'react-i18next';
import { version } from '@/package.json';

export default function ManagerPage() {
  const router = useRouter();
  const { register, session } = useNostr();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    if (session.isAuthenticated) {
      router.push('/messages');
    }
  }, [session.isAuthenticated, router]);

  const translateAuthError = (error: string | undefined): string => {
    const fallback = t('auth.registration_failed');
    if (!error) return fallback;
    if (error.startsWith('No relay connection')) return t('auth.error_no_relay');
    if (error === 'Account already exists') return t('auth.error_account_exists');
    return error;
  };

  const handleRegister = async () => {
    if (!username || !password) return;
    setIsLoading(true);
    const result = await register(username, password);
    setIsLoading(false);
    if (result.success) {
      setToast({ message: t('auth.registered_success'), type: 'success' });
      setUsername('');
      setPassword('');
    } else {
      setToast({ message: translateAuthError(result.error), type: 'error' });
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      {mounted && (
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="fixed top-4 right-4 z-50 p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          aria-label={t('common.settings')}
          data-testid="open-settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      )}
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 dark:shadow-none">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100">dodo-box</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">{t('auth.manager_title') || '账户管理'}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl"
        >
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {t('auth.register_title')}
          </h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t('auth.username')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  data-testid="username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.enter_username')}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  data-testid="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.enter_password')}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          </div>
          <button
            data-testid="submit-btn"
            onClick={handleRegister}
            disabled={!username || !password || isLoading}
            className="w-full px-4 py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                {t('auth.register')}
              </>
            )}
          </button>
        </motion.div>
      </div>
      <div className="h-24" />

      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-zinc-50 dark:bg-zinc-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-3">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{t('common.settings')}</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                aria-label={t('common.cancel')}
                data-testid="close-settings"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            <GeneralSettings onToast={(message, type) => setToast({ message, type })} />
          </div>
        </div>
      )}

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <div className="fixed bottom-4 right-4 text-[10px] font-mono text-zinc-300 dark:text-zinc-600 select-none pointer-events-none">
        v{version}
      </div>
    </main>
  );
}