/**
 * Capacitor export build orchestrator.
 * Runs prebuild → next build → postbuild, ensuring postbuild
 * always runs even if the build fails.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, BUILD_TARGET: 'capacitor' } });
}

// Prebuild: move incompatible files
run('node scripts/cap-prebuild.js');

let exitCode = 0;
try {
  run('npx next build');
} catch (err) {
  exitCode = err.status || 1;
} finally {
  // Always restore files
  run('node scripts/cap-postbuild.js');
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
