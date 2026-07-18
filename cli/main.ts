// main.ts — DodoBox CLI: walkie-talkie style Nostr messaging

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import crypto from 'node:crypto'
import { createSession } from '@/lib/messaging/session'
import { encryptSecret, decryptSecret } from '@/lib/messaging/vault-crypto-node'
import { connectToRelays, getRelayStatusMap } from '@/lib/messaging/relay-node'
import { SocketStatus } from '@welshman/net'
import { sendDirectMessage } from '@/lib/messaging/sender'
import { startReceiving } from '@/lib/messaging/receiver'
import type { ReceivedMessage } from '@/lib/messaging/receiver'
import { fetchContacts, publishContacts, addContact as addContactToList, removeContact as removeContactFromList, listContacts, findContact, fetchRecentMessages } from '@/lib/messaging/contacts'
import type { CliContact } from '@/lib/messaging/contacts'
import { fetchProfile } from '@/lib/messaging/profile'
import { initTracking, testAllRelays, testRelayQuality } from '@/lib/messaging/relay-quality'
import { initNodeEngine, destroyNodeEngine } from '@/lib/welshman/engine-node'
import { deriveMasterKey } from '@/lib/nostr/key-derivation'
import readline from 'node:readline'
import { createInterface } from 'node:readline'

const CONFIG_DIR = join(homedir(), '.dodobox')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://r1.fingerfan.top',
]

interface CliConfig {
  relays: string[]
}

interface UserInfo {
  username: string
  pubkey: string
  passwordHash: string
  encryptedSecret: string
  createdAt: number
}

function getUserDir(username: string): string {
  return join(CONFIG_DIR, username)
}

function getUserInfoFile(username: string): string {
  return join(getUserDir(username), 'userinfo.json')
}

function hashPassword(username: string, password: string): string {
  return crypto.createHash('sha256')
    .update(username + ':' + password)
    .digest('hex')
}

function verifyPassword(username: string, password: string, hash: string): boolean {
  return hashPassword(username, password) === hash
}

function loadUserInfo(username: string): UserInfo | null {
  const file = getUserInfoFile(username)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

function saveUserInfo(username: string, info: UserInfo): void {
  const dir = getUserDir(username)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(getUserInfoFile(username), JSON.stringify(info, null, 2))
}

function loadCliConfig(): CliConfig | null {
  if (!existsSync(CONFIG_FILE)) return null
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
}

function saveCliConfig(config: CliConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

async function ask(prompt: string): Promise<string> {
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
  const config = loadCliConfig()

  // Merge user config relays + defaults (deduplicated)
  const allRelays = [...new Set([...(config?.relays || []), ...DEFAULT_RELAYS])]

  // Get username
  const username = await ask('Username: ')
  const password = await ask('Password: ')

  let session: Awaited<ReturnType<typeof createSession>>
  const existingUser = loadUserInfo(username)

  if (!existingUser) {
    // Register new account
    console.log(`\nRegistering new account: ${username}...`)
    session = await createSession(username, password)

    const userInfo: UserInfo = {
      username,
      pubkey: session.masterPubkey,
      passwordHash: hashPassword(username, password),
      encryptedSecret: encryptSecret(session.masterPrivkey, session.masterPrivkey),
      createdAt: Date.now(),
    }
    saveUserInfo(username, userInfo)

    // Save relay config if not exists
    if (!config) {
      saveCliConfig({ relays: DEFAULT_RELAYS })
    }

    console.log(`\n✅ Registered as @${username}`)
    console.log(`   Pubkey: ${session.masterPubkey}\n`)
  } else {
    // Login existing account
    if (!verifyPassword(username, password, existingUser.passwordHash)) {
      console.error('❌ Wrong password')
      process.exit(1)
    }

    console.log(`\nLogging in as @${username}...`)

    // Decrypt private key
    const derivedKey = deriveMasterKey(username, password)
    const privkey = decryptSecret(derivedKey.privateKey, existingUser.encryptedSecret)

    // Reconstruct session
    session = {
      username,
      derivedKey,
      identities: [],
      currentIdentity: {
        name: username,
        pubkey: existingUser.pubkey,
        encryptedSecret: existingUser.encryptedSecret,
        createdAt: existingUser.createdAt,
      },
      masterPrivkey: privkey,
      masterPubkey: existingUser.pubkey,
    }

    console.log(`✅ Welcome back!`)
    console.log(`   Pubkey: ${session.masterPubkey}\n`)
  }

  // Relay state — no auto-connect, user picks via /relay select
  let selectedRelays: string[] = []
  let receiver: AbortController | null = null

  // Contacts — loaded after relay selection
  let contacts: CliContact[] = []
  const receivedMessages: ReceivedMessage[] = []

  // Currently selected contact (for direct text sending)
  let selectedContact: CliContact | null = null

  const onMessage = (msg: ReceivedMessage) => {
    receivedMessages.push(msg)
    const contact = contacts.find(c => c.pubkey === msg.senderPubkey)
    const senderName = contact?.name || msg.senderPubkey.slice(0, 8)
    console.log(`\n📨 From ${senderName}: "${msg.text}"\n> `)
  }

  // Interactive loop — persistent 'line' listener + input queue
  // so user input during `await sendDirectMessage(...)` is not lost.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const inputQueue: string[] = []
  let inputResolver: ((v: string) => void) | null = null

  rl.on('line', (line) => {
    if (inputResolver) {
      const resolve = inputResolver
      inputResolver = null
      resolve(line)
    } else {
      inputQueue.push(line)
    }
  })

  const getNextInput = (prompt?: string): Promise<string> => {
    if (prompt) process.stdout.write(prompt)
    if (inputQueue.length > 0) return Promise.resolve(inputQueue.shift()!)
    return new Promise((resolve) => { inputResolver = resolve })
  }

  console.log('Type /relay list to see available relays, /relay select <index> to connect.')
  console.log('Commands: /me  /select  /contacts  /add  /remove  /list  /profile  /history  /relay  /help  /quit\n')

  while (true) {
    const input = await getNextInput('> ')
    const trimmed = input.trim().toLowerCase()

    if (!trimmed) continue

    if (trimmed === '/quit' || trimmed === '/exit') {
      break
    }

    if (trimmed === '/me') {
      console.log(`  Username: ${username}`)
      console.log(`  Pubkey: ${session.masterPubkey}`)
      continue
    }

    if (trimmed === '/help') {
      console.log(`
Commands:
  /me                    Show your pubkey and username
  /select <name|pubkey>  Select a contact (then just type to chat)
  /unselect              Clear selected contact
  /contacts              List all contacts
  /add <pubkey> [name]   Add a contact
  /addnpub <npub> [name] Add a contact by npub
  /remove <pubkey>       Remove a contact
  /list                  Show last 20 received messages
  /profile <pubkey>      Lookup a user's profile
  /history <pubkey>      Show recent message history with a contact
  /relay list            List all relays with index (selected marked with *)
  /relay test <index>    Test a relay (0 = all)
  /relay select <index>  Select relay for operations (0 = all)
  /status                Show relay connection status
  /quit                  Exit

Tips:
  - Use /relay select first to connect to relays
  - After /select, everything you type goes to that contact
  - Messages are sent via NIP-59 gift wrap (encrypted)
  - Contacts are stored on relay (kind:3 NIP-02)
`)
      continue
    }

    if (trimmed === '/status') {
      const map = getRelayStatusMap()
      for (const url of allRelays) {
        const connected = map.get(url) === SocketStatus.Open
        console.log(`  ${connected ? '✅' : '❌'} ${url}`)
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

    if (trimmed === '/contacts') {
      listContacts(contacts)
      continue
    }

    if (trimmed.startsWith('/addnpub ') || trimmed.startsWith('/add ')) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const parts = input.trim().split(/\s+/)
      const identifier = parts[1]
      const name = parts.slice(2).join(' ') || undefined
      const updated = addContactToList(contacts, identifier, name)
      if (updated) {
        contacts = updated
        await publishContacts(contacts, session.masterPrivkey, selectedRelays)
        console.log('  📤 Contacts synced to relay.')
      }
      continue
    }

    if (trimmed.startsWith('/remove ')) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const pubkey = input.trim().slice(8).trim()
      contacts = removeContactFromList(contacts, pubkey)
      await publishContacts(contacts, session.masterPrivkey, selectedRelays)
      console.log('  📤 Contacts synced to relay.')
      continue
    }

    if (trimmed === '/select' || trimmed.startsWith('/select ')) {
      if (trimmed === '/select') {
        if (selectedContact) {
          console.log(`  Currently chatting with: ${selectedContact.name} (${selectedContact.pubkey.slice(0, 16)}...)`)
        } else {
          console.log('  No contact selected. Use /select <name|pubkey>')
        }
        continue
      }
      const query = input.trim().slice(8).trim()
      const contact = findContact(contacts, query)
      if (!contact) {
        console.log(`  ❌ Contact not found: ${query}`)
        continue
      }
      selectedContact = contact
      console.log(`  ✅ Now chatting with ${contact.name} (${contact.pubkey.slice(0, 16)}...)`)
      continue
    }

    if (trimmed === '/unselect' || trimmed === '/clear') {
      if (selectedContact) {
        console.log(`  Cleared contact: ${selectedContact.name}`)
        selectedContact = null
      } else {
        console.log('  No contact was selected.')
      }
      continue
    }

    if (trimmed.startsWith('/profile ')) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const pubkey = trimmed.slice(9).trim()
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        console.log('  ❌ Invalid pubkey format\n')
        continue
      }
      console.log(`  Looking up profile for ${pubkey.slice(0, 16)}...`)
      const profile = await fetchProfile(pubkey, selectedRelays)

      if (!profile) {
        console.log('  No profile information found.\n')
        continue
      }

      if (profile.name || profile.displayName) {
        console.log(`  Name: ${profile.name || profile.displayName}`)
      }
      if (profile.about) {
        console.log(`  About: ${profile.about}`)
      }
      if (profile.picture) {
        console.log(`  Picture: ${profile.picture}`)
      }
      if (!profile.name && !profile.displayName && !profile.about) {
        console.log('  No profile information found.\n')
      }
      continue
    }

    if (trimmed.startsWith('/history ')) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const pubkey = trimmed.slice(9).trim()
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        console.log('  ❌ Invalid pubkey format\n')
        continue
      }

      console.log(`  Fetching history with ${pubkey.slice(0, 16)}...`)
      const messages = await fetchRecentMessages(
        session.masterPubkey,
        pubkey,
        selectedRelays,
        session.masterPrivkey,
        20
      )

      if (messages.length === 0) {
        console.log('  No recent messages found.\n')
      } else {
        console.log(`\n  Recent messages (${messages.length}):`)
        console.log('  ──────────────────────────────────────')
        for (const m of messages.reverse()) {
          const senderName = m.senderPubkey === session.masterPubkey ? 'You' : m.senderPubkey.slice(0, 8) + '...'
          console.log(`  [${m.timestamp.toLocaleTimeString()}] ${senderName}: "${m.text}"`)
        }
        console.log('  ──────────────────────────────────────\n')
      }
      continue
    }

    if (trimmed === '/relay list') {
      const map = getRelayStatusMap()
      console.log('')
      for (let i = 0; i < allRelays.length; i++) {
        const url = allRelays[i]
        const connected = map.get(url) === SocketStatus.Open
        const selected = selectedRelays.includes(url) ? '*' : ' '
        console.log(`  ${i + 1}. ${connected ? '✅' : '❌'}${selected} ${url}`)
      }
      if (selectedRelays.length === 0) {
        console.log('  No relay selected. Use /relay select <index>.')
      } else if (selectedRelays.length === allRelays.length) {
        console.log('  Using all relays.')
      } else {
        console.log(`  Using: ${selectedRelays.join(', ')}`)
      }
      console.log('')
      continue
    }

    if (trimmed.startsWith('/relay test ') || trimmed === '/relay test') {
      const arg = trimmed.slice(12).trim()
      if (!arg || arg === '0') {
        // Test all
        initTracking(allRelays)
        await testAllRelays(session.masterPrivkey)
        continue
      }
      const index = parseInt(arg, 10)
      if (isNaN(index) || index < 1 || index > allRelays.length) {
        console.log(`  ❌ Invalid index. Use 0-${allRelays.length} (0 = all)\n`)
        continue
      }
      const url = allRelays[index - 1]
      initTracking([url])
      console.log(`  Testing ${url}...`)
      const quality = await testRelayQuality(url, session.masterPrivkey)
      const icon = quality.successRate >= 0.8 ? '✅' : quality.successRate > 0 ? '⚠️' : '❌'
      console.log(`  ${icon} Latency: ${quality.avgLatencyMs}ms | Success: ${(quality.successRate * 100).toFixed(0)}%\n`)
      continue
    }

    if (trimmed.startsWith('/relay select ') || trimmed === '/relay select') {
      const arg = trimmed.slice(14).trim()
      if (!arg) {
        // Show current selection
        if (selectedRelays.length === 0) {
          console.log('  No relay selected. Use /relay select <index> (0 = all).\n')
        } else if (selectedRelays.length === allRelays.length) {
          console.log('  Using all relays.\n')
        } else {
          console.log(`  Using: ${selectedRelays.join(', ')}\n`)
        }
        continue
      }
      const index = parseInt(arg, 10)
      if (isNaN(index) || index < 0 || index > allRelays.length) {
        console.log(`  ❌ Invalid index. Use 0-${allRelays.length} (0 = all)\n`)
        continue
      }

      // Stop existing receiver if any
      if (receiver) { receiver.abort(); receiver = null }

      if (index === 0) {
        selectedRelays = [...allRelays]
      } else {
        selectedRelays = [allRelays[index - 1]]
      }

      console.log(`  Connecting to ${selectedRelays.length} relay(s)...`)
      connectToRelays(selectedRelays)
      await new Promise((r) => setTimeout(r, 2000))

      const map = getRelayStatusMap()
      const connected = selectedRelays.filter(u => map.get(u) === SocketStatus.Open)
      for (const url of selectedRelays) {
        console.log(`  ${map.get(url) === SocketStatus.Open ? '✅' : '❌'} ${url}`)
      }

      if (connected.length === 0) {
        console.log('  ❌ Failed to connect to any selected relay.\n')
        selectedRelays = []
        continue
      }

      initTracking(selectedRelays)

      // Fetch contacts
      console.log('  Fetching contacts...')
      contacts = await fetchContacts(session.masterPubkey, selectedRelays)
      console.log(`  ${contacts.length} contact(s) loaded.`)

      // Start receiving
      receiver = startReceiving(session.masterPubkey, session.masterPrivkey, selectedRelays, onMessage)

      if (selectedRelays.length === allRelays.length) {
        console.log('  ✅ Using all relays.\n')
      } else {
        console.log(`  ✅ Using: ${selectedRelays[0]}\n`)
      }
      continue
    }

    // If a contact is selected, send text directly to them
    if (selectedContact && !trimmed.startsWith('/')) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const text = input.trim()
      console.log(`  Sending to ${selectedContact.name}...`)
      const result = await sendDirectMessage(text, selectedContact.pubkey, session.masterPrivkey, selectedRelays)

      if (result.success) {
        console.log(`  ✅ Sent! (${result.relayCount} relays)\n`)
      } else {
        console.log(`  ❌ Failed: ${result.error}\n`)
      }
      continue
    }

    // Try to parse as a 64-char hex pubkey (one-off send)
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      if (selectedRelays.length === 0) { console.log('  ❌ No relay selected. Use /relay select <index> first.\n'); continue }
      const recipient = trimmed
      console.log(`\nSending to ${recipient.slice(0, 16)}...`)
      const text = await getNextInput('  Message: ')
      const result = await sendDirectMessage(text, recipient, session.masterPrivkey, selectedRelays)

      if (result.success) {
        console.log(`  ✅ Sent! Event: ${result.eventId.slice(0, 16)}... (${result.relayCount} relays)\n`)
      } else {
        console.log(`  ❌ Failed: ${result.error}\n`)
      }
    } else {
      console.log('  Unknown command or no contact selected. Type /help for options.\n')
    }
  }

  // Cleanup
  rl.close()
  receiver?.abort()
  destroyNodeEngine()
  console.log('\nGoodbye!\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
