// app/api/telegram/[token]/route.ts
// Catch-all route for Telegram Bot API endpoints
// Handles: GET/POST /api/telegram/bot<token>/getMe, /sendMessage, /getUpdates, /getChat, etc.

import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/mock-telegram-server'

// Initialize store from env on first request
function ensureInitialized() {
  if (store.config) return true

  const botToken = process.env.NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN || 'mock-bot-token-12345'
  const botUserId = 999999
  const botUsername = process.env.MOCK_BOT_USERNAME || 'dodobox_bot'
  const botFirstName = process.env.MOCK_BOT_FIRST_NAME || 'DodoBox Bot'

  // Default contacts (can be overridden via env in the future)
  const contacts = [
    {
      id: 1001,
      username: 'alice_design',
      first_name: 'Alice',
      responses: [
        'That sounds great! Let me mock it up.',
        'I think we should simplify the layout a bit.',
        'Can you send me the latest build?',
        'Love the new color scheme!',
        "I'll have the redesign ready by tomorrow.",
        'Have you considered a dark mode version?',
      ],
    },
    {
      id: 1002,
      username: 'bob_dev',
      first_name: 'Bob',
      responses: [
        "I'll push the fix now.",
        'Can you review my PR?',
        'Deployed to staging.',
        "Found the bug, it's a race condition in the auth flow.",
        'CI is green, merging to main.',
        'The API response time dropped by 200ms after the refactor.',
      ],
    },
    {
      id: 1003,
      username: 'charlie_pm',
      first_name: 'Charlie',
      responses: [
        "What's the ETA?",
        "Let's sync tomorrow at 10am.",
        'Approved. Ship it!',
        'The stakeholder meeting went well, we got the go-ahead.',
        'Can we prioritize the bug fix over the new feature?',
        'Sprint review is on Friday, please prepare demos.',
      ],
    },
  ]

  const initialMessages: Record<number, Array<{ from: 'me' | 'them'; text: string; delayMin: number }>> = {
    1001: [
      { from: 'them', text: "Hey! How's the new feature coming along?", delayMin: 60 },
      { from: 'me', text: 'Almost done, just finishing the tests.', delayMin: 55 },
      { from: 'them', text: 'Great, let me know when it\'s ready to review!', delayMin: 50 },
      { from: 'them', text: 'I have some design suggestions too.', delayMin: 45 },
    ],
    1002: [
      { from: 'them', text: 'Hey, did you see the CI failure on main?', delayMin: 30 },
      { from: 'me', text: 'Yeah, looking into it now.', delayMin: 25 },
      { from: 'them', text: "I think it's related to the dependency update.", delayMin: 20 },
      { from: 'me', text: 'Fixed it. Was a breaking change in the linter config.', delayMin: 15 },
      { from: 'them', text: 'Nice! Pushing my PR now.', delayMin: 10 },
    ],
    1003: [
      { from: 'them', text: 'Quick update: the client approved the new scope.', delayMin: 20 },
      { from: 'me', text: 'Great news! What\'s the new timeline?', delayMin: 15 },
      { from: 'them', text: 'We have until end of month. Should be enough.', delayMin: 10 },
    ],
  }

  store.init({
    botToken,
    botUserId,
    botUsername,
    botFirstName,
    contacts,
    initialMessages,
  })
  return true
}

function okResult(result: unknown) {
  return NextResponse.json({ ok: true, result })
}

function errorResult(code: number, description: string) {
  return NextResponse.json({ ok: false, error_code: code, description })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  ensureInitialized()

  const { token } = await params
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  // segments: ['api', 'telegram', 'bot<token>', '<endpoint>']
  const endpoint = segments[3] || ''

  if (token !== `bot${store.config!.botToken}`) {
    return errorResult(401, 'Unauthorized')
  }

  const query = Object.fromEntries(url.searchParams.entries())

  switch (endpoint) {
    case 'getMe':
      return okResult({
        id: store.config!.botUserId,
        is_bot: true,
        first_name: store.config!.botFirstName,
        username: store.config!.botUsername,
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      })

    case 'getChat': {
      const chatId = parseInt(query.chat_id || '0', 10)
      const user = store.getUser(chatId)
      if (!user) return errorResult(400, 'Chat not found')
      return okResult({ id: user.id, first_name: user.first_name, username: user.username, type: 'private' })
    }

    case 'deleteWebhook':
      return okResult(true)

    case 'setMyCommands':
      return okResult(true)

    default:
      return errorResult(404, `Not Found: ${endpoint}`)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  ensureInitialized()

  const { token } = await params
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const endpoint = segments[3] || ''

  if (token !== `bot${store.config!.botToken}`) {
    return errorResult(401, 'Unauthorized')
  }

  const body = await request.json().catch(() => ({}))

  switch (endpoint) {
    case 'sendMessage': {
      const { chat_id, text } = body
      if (!chat_id || !text) return errorResult(400, 'chat_id and text are required')

      const chatId = typeof chat_id === 'string' ? parseInt(chat_id, 10) : chat_id

      // Ensure user exists
      if (!store.getUser(chatId)) {
        store.users.set(chatId, {
          id: chatId,
          username: `user_${chatId}`,
          first_name: `User ${chatId}`,
          is_bot: false,
        })
      }

      const msg = store.addMessage(chatId, text, store.config!.botUserId)
      return okResult({
        message_id: msg.message_id,
        from: { id: store.config!.botUserId, is_bot: true, username: store.config!.botUsername },
        chat: { id: chatId, first_name: store.getUser(chatId)?.first_name, type: 'private' },
        date: msg.date,
        text: msg.text,
      })
    }

    case 'getUpdates': {
      const { offset = 0, limit = 100, timeout = 1 } = body

      // First check if there are already pending updates
      const existing = store.getPendingUpdates(offset as number, limit as number)
      if (existing.length > 0) {
        store.markUpdatesConsumed(offset as number)
        return okResult(existing)
      }

      // Long-poll: wait up to timeout seconds for new updates
      // In a real server, we'd use a proper wait mechanism. For simplicity, poll briefly.
      const start = Date.now()
      const timeoutMs = Math.min((timeout as number) * 1000, 25000)

      while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 500))
        const updates = store.getPendingUpdates(offset as number, limit as number)
        if (updates.length > 0) {
          store.markUpdatesConsumed(offset as number)
          return okResult(updates)
        }
      }

      return okResult([])
    }

    case 'getChat': {
      const chatId = typeof body.chat_id === 'string' ? parseInt(body.chat_id, 10) : body.chat_id
      const user = store.getUser(chatId)
      if (!user) return errorResult(400, 'Chat not found')
      return okResult({ id: user.id, first_name: user.first_name, username: user.username, type: 'private' })
    }

    case 'getChatMember': {
      const userId = typeof body.user_id === 'string' ? parseInt(body.user_id, 10) : body.user_id
      const user = store.getUser(userId)
      if (!user) return errorResult(400, 'User not found')
      return okResult({
        user: { id: user.id, is_bot: user.is_bot, first_name: user.first_name, username: user.username },
        status: 'member',
      })
    }

    case 'sendPhoto':
    case 'sendDocument':
    case 'sendVideo':
    case 'sendAudio':
      const chatId = typeof body.chat_id === 'string' ? parseInt(body.chat_id, 10) : body.chat_id
      return okResult({
        message_id: store.nextMessageId++,
        from: { id: store.config!.botUserId, is_bot: true, username: store.config!.botUsername },
        chat: { id: chatId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
      })

    case 'deleteWebhook':
      return okResult(true)

    case 'setMyCommands':
      return okResult(true)

    default:
      return errorResult(404, `Not Found: ${endpoint}`)
  }
}
