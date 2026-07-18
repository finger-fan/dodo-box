import { execSync } from 'child_process'

export default async function globalTeardown() {
  console.log('[global-teardown] Stopping test relay...')
  execSync('docker compose -f docker/docker-compose.test.yml down -v', {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: 30_000,
  })
  console.log('[global-teardown] Test relay stopped.')
}
