// main.ts — DodoBox CLI: walkie-talkie style Nostr messaging

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import crypto from 'node:crypto'
import { createSession } from '@/lib/messaging/session'
import { encryptSecret, decryptSecret } from '@/lib/messaging/vault-crypto-node'
import { connectRelays, getStatus, getDefaultRelays } from './relay'
import { sendDirectMessage } from '@/lib/messaging/sender'
import { startReceiving } from '@/lib/messaging/receiver'
import type { ReceivedMessage } from '@/lib/messaging/receiver'
import { fetchContacts, publishContacts, addContact as addContactToList, removeContact as removeContactFromList, listContacts, findContact, fetchRecentMessages } from '@/lib/messaging/contacts'
import type { CliContact } from '@/lib/messaging/contacts'
import { fetchProfile } from '@/lib/messaging/profile'
import { initTracking, testAllRelays } from '@/lib/messaging/relay-quality'
import { initNodeEngine, destroyNodeEngine } from '@/lib/welshman/engine-node'
import { deriveMasterKey } from '@/lib/nostr/key-derivation'
import readline from 'node:readline'
import { createInterface } from 'node:readline'

const CONFIG_DIR = join(homedir(), '.dodobox')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

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
  const defaultRelays = getDefaultRelays()

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
      saveCliConfig({ relays: defaultRelays })
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

  // Initialize relay quality tracking
  initTracking(relays)

  // Fetch contacts from relay (kind:3 NIP-02)
  console.log('Fetching contacts from relay...')
  let contacts: CliContact[] = await fetchContacts(session.masterPubkey, relays)
  console.log(`  ${contacts.length} contact(s) loaded.\n`)

  // Currently selected contact (for direct text sending)
  let selectedContact: CliContact | null = null

  // Start receiving messages
  const receivedMessages: ReceivedMessage[] = []
  const onMessage = (msg: ReceivedMessage) => {
    receivedMessages.push(msg)
    const contact = contacts.find(c => c.pubkey === msg.senderPubkey)
    const senderName = contact?.name || msg.senderPubkey.slice(0, 8)
    console.log(`\n📨 From ${senderName}: "${msg.text}"\n> `)
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

  console.log('Use /select <name> to pick a contact, then just type to chat.')
  console.log('Commands: /me  /select  /contacts  /add  /remove  /status  /list  /profile  /quality  /help  /quit\n')

  while (true) {
    const input = await question('> ')
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
  /quality               Test relay quality
  /status                Show relay connection status
  /quit                  Exit

Tips:
  - After /select, everything you type goes to that contact
  - Or paste a 64-char hex pubkey to send a one-off message
  - Messages are sent via NIP-59 gift wrap (encrypted)
  - Contacts are stored on relay (kind:3 NIP-02)
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

    if (trimmed === '/contacts') {
      listContacts(contacts)
      continue
    }

    if (trimmed.startsWith('/addnpub ') || trimmed.startsWith('/add ')) {
      const parts = input.trim().split(/\s+/)
      const identifier = parts[1]
      const name = parts.slice(2).join(' ') || undefined
      const updated = addContactToList(contacts, identifier, name)
      if (updated) {
        contacts = updated
        await publishContacts(contacts, session.masterPrivkey, relays)
        console.log('  📤 Contacts synced to relay.')
      }
      continue
    }

    if (trimmed.startsWith('/remove ')) {
      const pubkey = input.trim().slice(8).trim()
      contacts = removeContactFromList(contacts, pubkey)
      await publishContacts(contacts, session.masterPrivkey, relays)
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
      const pubkey = trimmed.slice(9).trim()
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        console.log('  ❌ Invalid pubkey format\n')
        continue
      }
      console.log(`  Looking up profile for ${pubkey.slice(0, 16)}...`)
      const profile = await fetchProfile(pubkey, relays)

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
      const pubkey = trimmed.slice(9).trim()
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        console.log('  ❌ Invalid pubkey format\n')
        continue
      }

      console.log(`  Fetching history with ${pubkey.slice(0, 16)}...`)
      const messages = await fetchRecentMessages(
        session.masterPubkey,
        pubkey,
        relays,
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

    if (trimmed === '/quality') {
      await testAllRelays(session.masterPrivkey)
      continue
    }

    // If a contact is selected, send text directly to them
    if (selectedContact && !trimmed.startsWith('/')) {
      const text = input.trim()
      console.log(`  Sending to ${selectedContact.name}...`)
      const result = await sendDirectMessage(text, selectedContact.pubkey, session.masterPrivkey, relays)

      if (result.success) {
        console.log(`  ✅ Sent! (${result.relayCount} relays)\n`)
      } else {
        console.log(`  ❌ Failed: ${result.error}\n`)
      }
      continue
    }

    // Try to parse as a 64-char hex pubkey (one-off send)
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
      console.log('  Unknown command or no contact selected. Type /help for options.\n')
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
