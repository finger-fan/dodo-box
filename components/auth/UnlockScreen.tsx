'use client';

import { useState } from 'react';
import { Shield, Lock, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNostr } from '@/contexts/NostrContext';
import { createLogger } from '@/lib/logger';

const log = createLogger('UnlockScreen');

/**
 * 页面重载后私钥(仅内存)丢失,会话进入 locked 状态。
 * 用户输入密码重新派生密钥即可恢复,无需重新登录。
 */
export default function UnlockScreen() {
  const { t } = useTranslation();
  const { session, unlock, logout } = useNostr();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const translateError = (err: string | undefined): string => {
    if (!err) return t('auth.login_failed');
    if (err === 'Wrong password') return t('auth.unlock_wrong_password');
    if (err.startsWith('No relay connection')) return t('auth.error_no_relay');
    if (err === 'Account not found') return t('auth.error_account_not_found');
    return err;
  };

  const handleUnlock = async () => {
    if (!password || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await unlock(password);
      if (!result.success) {
        log.warn(`unlock failed: ${result.error}`);
        setError(translateError(result.error));
      }
    } catch (err) {
      log.error('unlock threw', err);
      setError(t('auth.login_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 dark:shadow-none">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t('auth.unlock_title')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {t('auth.unlock_desc', { username: session.username })}
          </p>
        </div>

        <div className="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">
              {t('auth.password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                data-testid="unlock-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.enter_password')}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {error && (
            <p data-testid="unlock-error" className="text-sm text-red-500 ml-1">
              {error}
            </p>
          )}

          <button
            data-testid="unlock-submit-btn"
            onClick={handleUnlock}
            disabled={!password || isLoading}
            className="w-full px-4 py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('auth.unlock')
            )}
          </button>

          <button
            data-testid="unlock-logout-btn"
            onClick={logout}
            className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t('auth.unlock_switch_account')}
          </button>
        </div>
      </div>
    </div>
  );
}
