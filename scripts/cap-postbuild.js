/**
 * Capacitor post-build script.
 * Restores files that were temporarily moved by cap-prebuild.js.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const backupDir = path.join(root, '.cap-backup');

const targets = [
  { src: path.join(backupDir, 'middleware.ts'), dst: path.join(root, 'middleware.ts') },
  { src: path.join(backupDir, 'api'), dst: path.join(root, 'app', 'api') },
];

for (const { src, dst } of targets) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dst);
    console.log(`[cap-postbuild] restored ${path.relative(root, dst)}`);
  }
}
