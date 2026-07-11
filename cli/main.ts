// main.ts — DodoBox CLI: walkie-talkie style Nostr messaging

import { connectRelays, getStatus, getDefaultRelays } from './relay'
import { createSession, serializeSession } from '../lib/messaging/session'
import { sendDirectMessage } from './sender'
import { startReceiving } from './receiver'
import type { ReceivedMessage } from './receiver'
import type { CliSession } from '../lib/messaging/session'
import { initNodeEngine, destroyNodeEngine } from '../lib/welshman/engine-node'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline'

const CONFIG_DIR = join(process.env.HOME || process.env.USERPROFILE || '.', '.dodobox')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const VAULT_FILE = join(CONFIG_DIR, 'vault.dat')

interface CliConfig {
  relays: string[]
  username: string
  password: string
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadConfig(): CliConfig | null {
  if (!existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as CliConfig
  } catch {
    return null
  }
}

function saveConfig(config: CliConfig): void {
  ensureDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

function loadVault(): string | null {
  if (!existsSync(VAULT_FILE)) return null
  try {
    return readFileSync(VAULT_FILE, 'utf8')
  } catch {
    return null
  }
}

function saveVault(content: string): void {
  ensureDir()
  writeFileSync(VAULT_FILE, content, 'utf8')
}

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main(): Promise<void> {
  console.log('\n🦆 DodoBox CLI — Walkie-Talkie Nostr Messaging\n')

  // Init Node.js engine (no IndexedDB)
  initNodeEngine()

  // Load or create config
  const config = loadConfig()
  const defaultRelays = getDefaultRelays()

  let username: string
  let password: string

  if (!config?.username) {
    console.log('No account found. Registering...\n')
    username = await ask('Username: ')
    password = await ask('Password: ')

    const session = await createSession(username, password)
    saveVault(serializeSession(session))
    saveConfig({ relays: defaultRelays, username, password })

    console.log(`\n✅ Registered as @${username}`)
    console.log(`   Pubkey: ${session.masterPubkey.slice(0, 16)}...\n`)
  } else {
    username = config.username
    password = config.password
    console.log(`Welcome back! Logging in as ${username}...\n`)
  }

  // Connect to relays
  const relays = config?.relays || defaultRelays
  console.log(`Connecting to ${relays.length} relay(s)...\n`)
  const statuses = await connectRelays(relays)

  for (const s of statuses) {
    console.log(`  ${s.connected ? '✅' : '❌'} ${s.url}${s.error ? ` (${s.error})` : ''}`)
  }

  const connectedCount = statuses.filter((s) => s.connected).length
  if (connectedCount === 0) {
    console.error('\n❌ Failed to connect to any relay. Exiting.\n')
    process.exit(1)
  }
  console.log(`Connected to ${connectedCount}/${statuses.length} relays.\n`)

  // Load session
  const vaultContent = loadVault()
  if (!vaultContent) {
    console.error('No vault found. Please re-register.')
    process.exit(1)
  }

  const session = await createSession(username, password, vaultContent)
  console.log(`📡 Online as @${session.currentIdentity.name}`)
  console.log(`   Pubkey: ${session.masterPubkey.slice(0, 16)}...\n`)

  // Start receiving messages
  const receivedMessages: ReceivedMessage[] = []
  const onMessage = (msg: ReceivedMessage) => {
    receivedMessages.push(msg)
    console.log(`\n📨 From ${msg.senderPubkey.slice(0, 8)}...: "${msg.text}"\n> `)
  }

  const receiver = startReceiving(
    session.masterPubkey,
    session.masterPrivkey,
    relays,
    onMessage
  )

  // Interactive loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve))

  console.log('Type a 64-char hex pubkey to send a message.')
  console.log('Commands: /status  /list  /help  /quit\n')

  while (true) {
    const input = await question('> ')
    const trimmed = input.trim().toLowerCase()

    if (!trimmed) continue

    if (trimmed === '/quit' || trimmed === '/exit') {
      break
    }

    if (trimmed === '/help') {
      console.log(`
Commands:
  <64-char hex pubkey>  Send a DM to this pubkey
  /list                 Show last 20 received messages
  /status               Show relay connection status
  /quit                 Exit

Tips:
  - Messages are sent via NIP-59 gift wrap (encrypted)
  - Incoming messages appear instantly
  - No local history (walkie-talkie mode)
`)
      continue
    }

    if (trimmed === '/status') {
      const statuses = getStatus()
      for (const s of statuses) {
        console.log(`  ${s.connected ? '✅' : '❌'} ${s.url}`)
      }
      continue
    }

    if (trimmed === '/list') {
      if (receivedMessages.length === 0) {
        console.log('  No messages received yet.\n')
      } else {
        const recent = receivedMessages.slice(-20)
        for (const m of recent) {
          console.log(`  [${m.timestamp.toLocaleTimeString()}] ${m.senderPubkey.slice(0, 8)}...: "${m.text}"`)
        }
      }
      continue
    }

    // Try to parse as a 64-char hex pubkey
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      const recipient = trimmed
      console.log(`\nSending to ${recipient.slice(0, 16)}...`)
      const text = await question('  Message: ')
      const result = await sendDirectMessage(text, recipient, session.masterPrivkey, relays)

      if (result.success) {
        console.log(`  ✅ Sent! Event: ${result.eventId.slice(0, 16)}... (${result.relayCount} relays)\n`)
      } else {
        console.log(`  ❌ Failed: ${result.error}\n`)
      }
    } else {
      console.log('  Unknown command or invalid pubkey. Type /help for options.\n')
    }
  }

  // Cleanup
  rl.close()
  receiver.abort()
  destroyNodeEngine()
  console.log('\nGoodbye!\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
