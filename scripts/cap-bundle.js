/**
 * OTA bundle packager.
 *
 * 1. Runs `pnpm cap:export` to produce a static export in `out/`
 * 2. Zips `out/` into `dist/updates/<version>/bundle.zip`
 * 3. Generates `dist/updates/manifest.json`
 *
 * Usage:
 *   node scripts/cap-bundle.js [--base-url <url>]
 *
 * If --base-url is omitted, the url field in manifest.json uses a
 * placeholder that must be edited before upload.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;

// Parse --base-url flag
const args = process.argv.slice(2);
const baseUrlIdx = args.indexOf('--base-url');
const baseUrl = baseUrlIdx !== -1 ? args[baseUrlIdx + 1] : null;

const outDir = path.join(root, 'out');
const distUpdates = path.join(root, 'dist', 'updates', version);
const bundlePath = path.join(distUpdates, 'bundle.zip');
const manifestPath = path.join(root, 'dist', 'updates', 'manifest.json');

// Step 1: Build static export
console.log(`[cap-bundle] Building static export for v${version}...`);
execSync('pnpm cap:export', { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(outDir)) {
  console.error('[cap-bundle] ERROR: out/ directory not found after build');
  process.exit(1);
}

// Step 2: Create zip
console.log(`[cap-bundle] Creating bundle zip...`);
fs.mkdirSync(distUpdates, { recursive: true });

// Use system zip command (available on Linux/macOS)
execSync(`cd "${outDir}" && zip -r "${bundlePath}" .`, { stdio: 'inherit' });

// Step 3: Compute checksum
const fileBuffer = fs.readFileSync(bundlePath);
const checksum = createHash('sha256').update(fileBuffer).digest('hex');
const sizeKB = Math.round(fileBuffer.length / 1024);

// Step 4: Generate manifest
const url = baseUrl
  ? `${baseUrl.replace(/\/$/, '')}/${version}/bundle.zip`
  : `https://YOUR_SERVER/updates/${version}/bundle.zip`;

const manifest = {
  version,
  url,
  checksum,
  minAppVersion: version.split('.').slice(0, 2).join('.') + '.0',
  notes: '',
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n[cap-bundle] Done!`);
console.log(`  Bundle: ${bundlePath} (${sizeKB} KB)`);
console.log(`  Checksum: ${checksum}`);
console.log(`  Manifest: ${manifestPath}`);
if (!baseUrl) {
  console.log(`\n  NOTE: Edit manifest.json to set the correct URL before uploading.`);
}
