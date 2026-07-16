/**
 * Capacitor export build orchestrator.
 * Runs prebuild → next build → postbuild, ensuring postbuild
 * always runs even if the build fails.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/**
 * Load .env.release (KEY=VALUE lines) for Capacitor builds.
 * System environment variables take precedence over file values.
 */
function loadReleaseEnv() {
  const file = path.join(root, '.env.release');
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key) env[key] = value;
  }
  return env;
}

const releaseEnv = loadReleaseEnv();
const releaseKeys = Object.keys(releaseEnv);
if (releaseKeys.length > 0) {
  console.log(`[cap-build-export] .env.release: ${releaseKeys.map(k => `${k}=${releaseEnv[k]}`).join(', ')}`);
} else {
  console.log('[cap-build-export] no .env.release found, using defaults');
}

function run(cmd) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...releaseEnv, ...process.env, BUILD_TARGET: 'capacitor' },
  });
}

// Prebuild: move incompatible files
run('node scripts/cap-prebuild.js');

let exitCode = 0;
try {
  run('pnpm exec next build');
} catch (err) {
  exitCode = err.status || 1;
} finally {
  // Always restore files
  run('node scripts/cap-postbuild.js');
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
