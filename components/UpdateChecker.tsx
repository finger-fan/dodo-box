'use client';

import { useUpdater } from '@/hooks/use-updater';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';

export default function UpdateChecker() {
  const { t } = useTranslation();
  const { available, manifest, downloading, error, apply } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  // Only render on native platforms with an available update
  if (!Capacitor.isNativePlatform()) return null;
  if (!available || !manifest || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-emerald-600 dark:bg-emerald-700 text-white rounded-2xl p-4 shadow-lg flex items-center gap-3">
        <Download className="w-5 h-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">
            {t('updater.new_version', { version: manifest.version })}
          </div>
          {manifest.notes && (
            <div className="text-xs text-emerald-100 truncate">{manifest.notes}</div>
          )}
          {error && (
            <div className="text-xs text-red-200 mt-1">{error}</div>
          )}
        </div>
        <button
          onClick={apply}
          disabled={downloading}
          className="shrink-0 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5"
        >
          {downloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('updater.downloading')}
            </>
          ) : (
            t('updater.update')
          )}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
