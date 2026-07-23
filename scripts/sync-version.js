/**
 * Sync version from package.json to Android build.gradle
 * 
 * versionCode formula: major * 10000 + minor * 100 + patch
 * Examples:
 *   0.9.1  → 901
 *   1.0.1  → 10001
 *   1.10.5 → 11005
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Read package.json version
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

// Generate a minute-resolution build stamp: year%10 + MM + DD + HH + mm
// e.g. 2026-07-24 01:15 → "607240115". Written back to package.json so
// next.config.ts can expose it to the app as NEXT_PUBLIC_APP_BUILD.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildStamp = `${now.getFullYear() % 10}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

pkg.build = buildStamp;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`[sync-version] package.json version: ${version}, build: ${buildStamp}`);

// Parse version
const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!match) {
  console.error(`[sync-version] Invalid version format: ${version}`);
  process.exit(1);
}

const [, major, minor, patch] = match.map(Number);

// Calculate versionCode
const versionCode = major * 10000 + minor * 100 + patch;
const versionName = `${major}.${minor}.${patch}`;

console.log(`[sync-version] Calculated versionCode: ${versionCode}, versionName: ${versionName}`);

// Update build.gradle
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

const original = gradle;

// Replace versionCode and versionName
gradle = gradle.replace(
  /versionCode\s+\d+/,
  `versionCode ${versionCode}`
);

gradle = gradle.replace(
  /versionName\s+["'][^"']+["']/,
  `versionName "${versionName}"`
);

if (gradle === original) {
  console.log('[sync-version] No changes needed');
} else {
  fs.writeFileSync(gradlePath, gradle);
  console.log('[sync-version] Updated android/app/build.gradle');
}