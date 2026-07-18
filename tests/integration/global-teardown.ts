import { execSync } from 'child_process'
import { resolve } from 'path'

export default async function teardown() {
  const composeFile = resolve('docker/docker-compose.test.yml')
  try {
    execSync(`docker compose -f ${composeFile} down -v`, { stdio: 'ignore' })
  } catch {
    // ignore
  }
}
