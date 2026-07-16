/**
 * OTA bundle packager.
 *
 * 1. Runs `pnpm cap:export` to produce a static export in `out/`
 * 2. Zips `out/` into `dist/updates/<version>/bundle.zip`
 * 3. Generates `dist/updates/manifest.json`
 * 4. Copies bundle to `site/updates/<version>/` if site/ exists
 *
 * Usage:
 *   node scripts/cap-bundle.js [--base-url <url>] [--notes "release notes"]
 *
 * If --base-url is omitted, reads NEXT_PUBLIC_UPDATE_URL from .env.local.
 * If not found in .env.local, uses a placeholder that must be edited before upload.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;

// Parse arguments
const args = process.argv.slice(2);

// Parse --base-url flag
const baseUrlIdx = args.indexOf('--base-url');
let baseUrl = baseUrlIdx !== -1 ? args[baseUrlIdx + 1] : null;

// Parse --notes flag
const notesIdx = args.indexOf('--notes');
const notes = notesIdx !== -1 ? args[notesIdx + 1] : '';

// If no base-url provided, try to read from .env.local
if (!baseUrl) {
  const envPath = path.join(root, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/NEXT_PUBLIC_UPDATE_URL=(.+)/);
    if (match) {
      baseUrl = match[1].trim().replace('/manifest.json', '');
    }
  }
}

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
  notes,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Step 5: Copy to site/updates/ if it exists
const siteUpdatesDir = path.join(root, 'site', 'updates', version);
const siteUpdatesExists = fs.existsSync(path.join(root, 'site', 'updates'));

if (siteUpdatesExists) {
  console.log(`[cap-bundle] Copying bundle to site/updates/${version}/...`);
  fs.mkdirSync(siteUpdatesDir, { recursive: true });
  fs.copyFileSync(bundlePath, path.join(siteUpdatesDir, 'bundle.zip'));
  fs.copyFileSync(manifestPath, path.join(path.dirname(siteUpdatesDir), 'manifest.json'));
  console.log(`[cap-bundle] Copied to site/updates/${version}/`);
}

console.log(`\n[cap-bundle] Done!`);
console.log(`  Bundle: ${bundlePath} (${sizeKB} KB)`);
console.log(`  Checksum: ${checksum}`);
console.log(`  Manifest: ${manifestPath}`);
if (!baseUrl) {
  console.log(`\n  NOTE: Edit manifest.json to set the correct URL before uploading.`);
}
if (notes) {
  console.log(`  Notes: ${notes}`);
}
