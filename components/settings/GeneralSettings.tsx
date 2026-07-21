'use client';

import { useEffect, useState, useCallback } from 'react';
import { Globe, Moon, Shield, Pencil, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useNostr } from '@/contexts/NostrContext';
import { useMounted } from '@/hooks/use-mounted';
import {
  getStatusMap,
  getRelayStateMap,
  initRelayManager,
  connectToRelays,
  reconnectRelay,
  reconnectFailedRelays,
  hasFailedRelays,
} from '@/lib/welshman/relay-manager';
import type { RelayStatus, RelayState } from '@/lib/welshman/relay-manager';
import { getDefaultRelays, getUserRelays, setUserRelays } from '@/lib/runtime-config';

interface GeneralSettingsProps {
  onToast?: (message: string, type: 'success' | 'error') => void;
}

/**
 * 通用偏好设置(语言 / 主题 / relay),登录页(对话框)和设置页共用。
 * 未登录时 relay 配置写入 localStorage,登录时 ensureRelays() 优先读取。
 */
export default function GeneralSettings({ onToast }: GeneralSettingsProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { session, adapter } = useNostr();
  const mounted = useMounted();

  const [relays, setRelays] = useState<string[]>(() => {
    const fromAdapter = adapter.getRelays();
    if (fromAdapter.length > 0) return fromAdapter;
    const userRelays = getUserRelays();
    return userRelays.length > 0 ? userRelays : getDefaultRelays();
  });
  const [isEditingRelays, setIsEditingRelays] = useState(false);
  const [relayInput, setRelayInput] = useState(() => relays.join('\n'));
  const [statusMap, setStatusMap] = useState<Map<string, RelayStatus>>(() => {
    if (typeof window === 'undefined') return new Map();
    return getStatusMap();
  });
  const [stateMap, setStateMap] = useState<Map<string, RelayState>>(() => {
    if (typeof window === 'undefined') return new Map();
    return getRelayStateMap();
  });

  // Initialize relay connections on mount
  useEffect(() => {
    connectToRelays(relays);
  }, []);

  // Subscribe to real-time relay status changes
  const handleStatusChange = useCallback((_url: string, _status: RelayStatus, _state: RelayState) => {
    setStatusMap(getStatusMap());
    setStateMap(getRelayStateMap());
  }, []);

  useEffect(() => {
    initRelayManager({ onStatusChange: handleStatusChange });
    return () => { initRelayManager({ onStatusChange: undefined }); };
  }, [handleStatusChange]);

  const currentLang = (i18n.resolvedLanguage || i18n.language || 'zh').startsWith('zh') ? 'zh' : 'en';

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleRelaySave = async () => {
    const newRelays = relayInput
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .filter((url, i, arr) => arr.indexOf(url) === i);
    if (session.isAuthenticated) {
      const result = await adapter.setRelays(newRelays);
      if (!result.success) {
        onToast?.(result.error || 'Failed to update relays', 'error');
        return;
      }
    } else {
      setUserRelays(newRelays);
    }
    setRelays(newRelays);
    setIsEditingRelays(false);
    onToast?.(t('settings.relays_updated'), 'success');
  };

  function getStatusColor(status?: RelayStatus) {
    if (status === 'connected') return 'bg-emerald-500';
    if (status === 'connecting') return 'bg-amber-500';
    if (status === 'failed' || status === 'unavailable') return 'bg-red-500';
    return 'bg-zinc-400';
  }

  function getStatusText(relay: string): string {
    const status = statusMap.get(relay);
    const state = stateMap.get(relay);
    
    if (status === 'connecting' && state && state.retryCount > 0) {
      return t('relay.status.reconnecting', { count: state.retryCount, max: 3 });
    }
    if (status === 'unavailable') {
      return t('relay.status.unavailable');
    }
    return t(`relay.status.${status || 'closed'}`, { defaultValue: status || 'closed' });
  }

  const hasFailed = hasFailedRelays();

  if (!mounted) return null;

  return (
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
              currentLang === 'en' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
            )}
          >EN</button>
          <button
            onClick={() => handleLanguageChange('zh')}
            className={cn(
              "px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-all",
              currentLang === 'zh' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : "text-zinc-400"
            )}
          >ZH</button>
        </div>
      </div>
      <div className="theme-menu flex items-center justify-between p-4 border-b border-zinc-50 dark:border-zinc-800">
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
      <div className="relay-list p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.relays')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded uppercase">{relays.length} {t('settings.relays_configured')}</span>
            <button
              onClick={() => { setIsEditingRelays(true); setRelayInput(relays.join('\n')); }}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label={t('common.edit')}
              title={t('common.edit')}
            >
              <Pencil className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
        {isEditingRelays ? (
          <div className="space-y-2">
            <textarea
              value={relayInput}
              onChange={(e) => setRelayInput(e.target.value)}
              className="w-full h-32 p-3 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              placeholder="wss://relay.example.com"
            />
            <div className="flex gap-2">
              <button
                onClick={handleRelaySave}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => setIsEditingRelays(false)}
                className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-xs font-bold transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {relays.map((relay) => {
              const status = statusMap.get(relay);
              const isFailed = status === 'failed' || status === 'unavailable';
              
              return (
                <div key={relay} className="relay-item text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-lg flex items-center justify-between">
                  <span className="truncate flex-1">{relay}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">{getStatusText(relay)}</span>
                    <div className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(status))} />
                    {isFailed && (
                      <button
                        onClick={() => reconnectRelay(relay)}
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                        aria-label={t('relay.reconnect')}
                        title={t('relay.reconnect')}
                      >
                        <RotateCcw className="w-3 h-3 text-zinc-400" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {hasFailed && (
              <button
                onClick={reconnectFailedRelays}
                className="w-full py-2 mt-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('relay.reconnect_failed')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
