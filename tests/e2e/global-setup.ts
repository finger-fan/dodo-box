import { execSync } from 'child_process'

export default async function globalSetup() {
  console.log('[global-setup] Starting test relay on port 7778...')
  execSync('docker compose -f docker-compose.test.yml up -d --wait', {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: 120_000,
  })
  console.log('[global-setup] Test relay is ready.')
}
