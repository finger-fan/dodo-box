/**
 * Copy APK to docker/download-site and update versions.json
 * Called after successful APK build.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Read version from build.gradle
function getVersionFromGradle() {
  const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const match = gradle.match(/versionName\s+["']([^"']+)["']/);
  if (!match) {
    throw new Error('Cannot find versionName in build.gradle');
  }
  return match[1];
}

// Find the APK file (newest by mtime — the output dir can hold several
// dated APKs and alphabetical order would pick the oldest date)
function findApk() {
  const apkDir = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release');
  const files = fs.readdirSync(apkDir)
    .filter(f => f.endsWith('.apk'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(apkDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    throw new Error('No APK found in release directory');
  }
  return path.join(apkDir, files[0].name);
}

// Main
const version = getVersionFromGradle();
// Use local date, not toISOString() (UTC): before 08:00 Beijing time UTC is
// still "yesterday", which misnames the APK and mismatches the Gradle-side
// outputFileName (which uses local time).
const now = new Date();
const pad2 = (n) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`; // YYYY-MM-DD, local
const dateCompact = date.replace(/-/g, ''); // YYYYMMDD

const apkSrc = findApk();
const apkFilename = `dodo-box-${version}-${dateCompact}.apk`;
const apkDst = path.join(root, 'docker', 'download-site', 'apk', apkFilename);

// Ensure directory exists
const apkDir = path.dirname(apkDst);
if (!fs.existsSync(apkDir)) {
  fs.mkdirSync(apkDir, { recursive: true });
}

// Copy APK
fs.copyFileSync(apkSrc, apkDst);
const stats = fs.statSync(apkDst);
console.log(`[copy-apk] Copied ${apkFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

// Update versions.json
const versionsPath = path.join(root, 'docker', 'download-site', 'versions.json');
let versions = [];

if (fs.existsSync(versionsPath)) {
  versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
}

// Check if this version+date already exists
const exists = versions.some(v => v.version === version && v.date === date);
if (!exists) {
  versions.unshift({
    version,
    date,
    file: apkFilename
  });
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
  console.log(`[copy-apk] Updated versions.json`);
} else {
  console.log(`[copy-apk] Version ${version} (${date}) already in versions.json`);
}

console.log(`[copy-apk] Done. APK: docker/download-site/apk/${apkFilename}`);