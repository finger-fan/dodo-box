import { execSync } from 'child_process'
import { resolve } from 'path'

const RELAY_URL = 'ws://localhost:7778'

async function isRelayReady(): Promise<boolean> {
  try {
    const WebSocket = require('ws')
    const ws = new WebSocket(RELAY_URL)
    return await new Promise((resolve) => {
      ws.on('open', () => {
        ws.close()
        resolve(true)
      })
      ws.on('error', () => resolve(false))
      ws.on('close', () => resolve(false))
      setTimeout(() => {
        ws.close()
        resolve(false)
      }, 2000)
    })
  } catch {
    return false
  }
}

export default async function setup() {
  const composeFile = resolve('docker-compose.test.yml')

  try {
    execSync('docker compose --version', { stdio: 'ignore' })
  } catch {
    console.warn('[global-setup] Docker not available, skipping relay launch')
    return
  }

  if (await isRelayReady()) {
    console.log('[global-setup] Test relay already running')
    return
  }

  try {
    execSync(`docker compose -f ${composeFile} up -d`, { stdio: 'inherit' })
  } catch {
    try {
      execSync(`docker compose -f ${composeFile} down -v`, { stdio: 'ignore' })
      execSync(`docker compose -f ${composeFile} up -d`, { stdio: 'inherit' })
    } catch (err) {
      console.warn('[global-setup] Failed to start test relay, integration tests will be skipped:', err)
      return
    }
  }

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await isRelayReady()) {
      console.log('[global-setup] Test relay ready')
      return
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.warn('[global-setup] Test relay did not become ready in time')
}
