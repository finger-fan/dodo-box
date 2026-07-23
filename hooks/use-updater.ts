'use client';

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { createLogger } from '@/lib/logger';
import {
  notifyAppReady,
  checkForUpdate,
  downloadAndApply,
  resetToBuiltin,
  type UpdateManifest,
} from '@/lib/updater';

const log = createLogger('Updater');

export interface UseUpdaterReturn {
  checking: boolean;
  downloading: boolean;
  available: boolean;
  manifest: UpdateManifest | null;
  error: string | null;
  check: () => Promise<void>;
  apply: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useUpdater(): UseUpdaterReturn {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [available, setAvailable] = useState(false);
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Notify plugin on mount that current bundle is healthy, then auto-check
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    notifyAppReady()
      .catch((err) => {
        log.warn(`notifyAppReady failed: ${err}`);
      })
      .then(() => {
        if (process.env.NEXT_PUBLIC_UPDATE_URL) check();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = useCallback(async () => {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
    setChecking(true);
    setError(null);
    try {
      const status = await checkForUpdate(currentVersion);
      setAvailable(status.available);
      setManifest(status.manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  const apply = useCallback(async () => {
    if (!manifest) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadAndApply(manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [manifest]);

  const reset = useCallback(async () => {
    setError(null);
    try {
      await resetToBuiltin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }, []);

  return { checking, downloading, available, manifest, error, check, apply, reset };
}
