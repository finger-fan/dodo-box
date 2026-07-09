// app/api/telegram/contacts/route.ts
// Custom endpoint: list all mock contacts (not a Telegram Bot API endpoint)

import { NextResponse } from 'next/server'
import { store } from '@/lib/mock-telegram-server'

// Ensure store is initialized
function ensureInitialized() {
  if (store.config) return
  // Lazy init by hitting the bot endpoint
  const botToken = process.env.NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN || 'mock-bot-token-12345'
  const botUserId = 999999
  const botUsername = process.env.MOCK_BOT_USERNAME || 'dodobox_bot'
  const botFirstName = process.env.MOCK_BOT_FIRST_NAME || 'DodoBox Bot'

  const contacts = [
    { id: 1001, username: 'alice_design', first_name: 'Alice', responses: ['Thanks!', 'Got it.', 'Sounds good!'] },
    { id: 1002, username: 'bob_dev', first_name: 'Bob', responses: ['On it.', 'PR is ready.', 'Fixed!'] },
    { id: 1003, username: 'charlie_pm', first_name: 'Charlie', responses: ['What\'s the ETA?', 'Approved.', 'Let\'s sync.'] },
  ]

  store.init({
    botToken,
    botUserId,
    botUsername,
    botFirstName,
    contacts,
    initialMessages: {},
  })
}

export async function GET() {
  ensureInitialized()
  const contacts = store.getAllContacts()
  return NextResponse.json({ ok: true, result: contacts })
}
