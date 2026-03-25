import { Capacitor } from '@capacitor/core';

export interface UpdateManifest {
  version: string;
  url: string;
  checksum?: string;
  minAppVersion?: string;
  notes?: string;
}

export interface UpdateStatus {
  available: boolean;
  manifest: UpdateManifest | null;
}

const isNative = () => Capacitor.isNativePlatform();

/**
 * Dynamically import the updater plugin only on native platforms.
 * Returns null on web to avoid bundling errors.
 */
async function getUpdater() {
  if (!isNative()) return null;
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
  return CapacitorUpdater;
}

/**
 * Notify the plugin that the current bundle loaded successfully.
 * Must be called on every app start — otherwise the plugin will
 * roll back to the previous bundle after a timeout.
 */
export async function notifyAppReady(): Promise<void> {
  const updater = await getUpdater();
  if (!updater) return;
  await updater.notifyAppReady();
}

/**
 * Fetch the remote manifest and compare versions.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus> {
  const updateUrl = process.env.NEXT_PUBLIC_UPDATE_URL;
  if (!updateUrl) {
    return { available: false, manifest: null };
  }

  const res = await fetch(updateUrl, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch update manifest: ${res.status}`);
  }

  const manifest: UpdateManifest = await res.json();

  if (manifest.minAppVersion && compareVersions(currentVersion, manifest.minAppVersion) < 0) {
    // Current app is too old — need a full APK update, not OTA
    return { available: false, manifest: null };
  }

  const isNewer = compareVersions(manifest.version, currentVersion) > 0;
  return { available: isNewer, manifest: isNewer ? manifest : null };
}

/**
 * Download the bundle zip and switch to it. The app will reload
 * with the new bundle on next restart / set call.
 */
export async function downloadAndApply(manifest: UpdateManifest): Promise<void> {
  const updater = await getUpdater();
  if (!updater) return;

  const bundle = await updater.download({
    url: manifest.url,
    version: manifest.version,
    ...(manifest.checksum ? { checksum: manifest.checksum } : {}),
  });

  await updater.set(bundle);
}

/**
 * Reset to the built-in bundle shipped with the APK.
 */
export async function resetToBuiltin(): Promise<void> {
  const updater = await getUpdater();
  if (!updater) return;
  await updater.reset();
}

/**
 * Compare two semver strings. Returns:
 *  - positive if a > b
 *  - negative if a < b
 *  - 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
