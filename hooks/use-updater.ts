'use client';

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  notifyAppReady,
  checkForUpdate,
  downloadAndApply,
  resetToBuiltin,
  type UpdateManifest,
} from '@/lib/updater';

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

  // Notify plugin on mount that current bundle is healthy
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    notifyAppReady().catch((err) => {
      console.warn('[Updater] notifyAppReady failed:', err);
    });
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

  // Auto-check on mount (native only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!process.env.NEXT_PUBLIC_UPDATE_URL) return;
    check();
  }, [check]);

  return { checking, downloading, available, manifest, error, check, apply, reset };
}
