/**
 * Capacitor pre-build script.
 * Temporarily moves files incompatible with Next.js static export
 * (middleware.ts, app/api/) so `next build` with output: 'export' succeeds.
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
];

for (const { src, dst } of targets) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dst);
    console.log(`[cap-prebuild] moved ${path.relative(root, src)} → ${path.relative(root, dst)}`);
  }
}