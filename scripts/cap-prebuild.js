/**
 * Capacitor pre-build script.
 * Temporarily moves files incompatible with Next.js static export
 * (middleware.ts, app/api/) so `next build` with output: 'export' succeeds.
 * Also moves .env.local aside so release APK builds only use .env.release
 * (injected via process.env by cap-build-export.js) and never leak
 * local-only values into the bundle.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const backupDir = path.join(root, '.cap-backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const targets = [
  { src: path.join(root, 'middleware.ts'), dst: path.join(backupDir, 'middleware.ts') },
  { src: path.join(root, 'app', 'api'), dst: path.join(backupDir, 'api') },
  { src: path.join(root, '.env.local'), dst: path.join(backupDir, 'env.local') },
];

for (const { src, dst } of targets) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dst);
    console.log(`[cap-prebuild] moved ${path.relative(root, src)} → ${path.relative(root, dst)}`);
  }
}