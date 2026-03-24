import { test, expect, snap, flushLogs } from './fixtures/multi-user.fixture'
import { ContactsPage } from './pages/contacts.page'
import { MessagesPage } from './pages/messages.page'

test.describe('Multi-user chat', () => {
  // Full flow needs time for register + relay sync + login + messaging
  test.setTimeout(180_000)

  test.afterAll(() => {
    flushLogs()
  })

  test('Alice and Bob can register, add contacts, and exchange messages', async ({ alice, bob }) => {
    // Step 1: Verify both users registered and reached messages page
    await expect(alice.page).toHaveURL(/\/messages/)
    await snap(alice.page, 'alice-registered')

    await expect(bob.page).toHaveURL(/\/messages/)
    await snap(bob.page, 'bob-registered')

    // Step 2: Alice adds Bob as contact using identity protocol (with nickname "Bob")
    const aliceContacts = new ContactsPage(alice.page)
    await aliceContacts.navigate()
    await aliceContacts.addContact(bob.identity.identityUrl)
    await snap(alice.page, 'alice-added-bob')

    // Step 3: Bob adds Alice as contact using identity protocol (with nickname "Alice")
    const bobContacts = new ContactsPage(bob.page)
    await bobContacts.navigate()
    await bobContacts.addContact(alice.identity.identityUrl)
    await snap(bob.page, 'bob-added-alice')

    // Step 4: Alice opens chat with Bob via contacts (client-side routing)
    const aliceMessages = new MessagesPage(alice.page)
    await aliceMessages.openChatViaContacts('Bob')
    await snap(alice.page, 'alice-chat-before')

    // Step 5: Alice sends a message to Bob
    const messageText = `Hello Bob! ${Date.now()}`
    await aliceMessages.sendMessage(messageText)
    await snap(alice.page, 'alice-chat-sent')

    // Step 6: Bob opens chat with Alice and should see the message
    const bobMessages = new MessagesPage(bob.page)
    await bobMessages.openChatViaContacts('Alice')
    await bobMessages.waitForMessage(messageText)
    await snap(bob.page, 'bob-received')

    // Step 7: Bob replies to Alice
    const replyText = `Hi Alice! ${Date.now()}`
    await bobMessages.sendMessage(replyText)
    await snap(bob.page, 'bob-replied')

    // Alice should see Bob's reply
    await aliceMessages.waitForMessage(replyText)
    await snap(alice.page, 'alice-received-reply')

    // Step 8: Real-time bidirectional chat
    const msg1 = `Realtime from Alice ${Date.now()}`
    await aliceMessages.sendMessage(msg1)
    await bobMessages.waitForMessage(msg1)

    const msg2 = `Realtime from Bob ${Date.now()}`
    await bobMessages.sendMessage(msg2)
    await aliceMessages.waitForMessage(msg2)

    await snap(alice.page, 'final-alice')
    await snap(bob.page, 'final-bob')
  })

  test('rapid message burst - no message loss', async ({ alice, bob }) => {
    // Setup: add contacts and open chats
    const aliceContacts = new ContactsPage(alice.page)
    await aliceContacts.navigate()
    await aliceContacts.addContact(bob.identity.identityUrl)

    const bobContacts = new ContactsPage(bob.page)
    await bobContacts.navigate()
    await bobContacts.addContact(alice.identity.identityUrl)

    const aliceMessages = new MessagesPage(alice.page)
    await aliceMessages.openChatViaContacts('Bob')

    const bobMessages = new MessagesPage(bob.page)
    await bobMessages.openChatViaContacts('Alice')

    // Send 5 messages rapidly from Alice (~200ms apart)
    const burstPrefix = `burst-${Date.now()}-`
    const burstCount = 5
    const sentMessages: string[] = []

    for (let i = 0; i < burstCount; i++) {
      const text = `${burstPrefix}${i}`
      sentMessages.push(text)
      const input = alice.page.locator('[data-testid="message-input"]')
      await input.fill(text)
      await alice.page.locator('[data-testid="send-btn"]').click()
      // 200ms between sends
      if (i < burstCount - 1) {
        await alice.page.waitForTimeout(200)
      }
    }

    // Wait for state to settle after rapid sending
    await alice.page.waitForTimeout(3_000)
    await snap(alice.page, 'alice-burst-sent')

    // Verify all messages appeared on Alice's side (optimistic + relay echo)
    // Also recover gaps if sender's own messages got lost
    await aliceMessages.recoverGaps()
    for (const text of sentMessages) {
      await expect(alice.page.locator(`text="${text}"`)).toBeVisible({ timeout: 15_000 })
    }

    // Wait for at least some messages to arrive on Bob's side, then recover any gaps
    await bob.page.waitForTimeout(5_000)
    const gapsRecovered = await bobMessages.recoverGaps()
    if (gapsRecovered > 0) {
      // Wait for recovered messages to render
      await bob.page.waitForTimeout(3_000)
    }
    await snap(bob.page, 'bob-after-recovery')

    // Verify all messages arrived on Bob's side (after gap recovery)
    for (const text of sentMessages) {
      await expect(bob.page.locator(`text="${text}"`)).toBeVisible({ timeout: 30_000 })
    }

    await snap(bob.page, 'bob-burst-received')

    // Now Bob sends 5 rapid messages back
    const replyPrefix = `reply-${Date.now()}-`
    const replyMessages: string[] = []

    for (let i = 0; i < burstCount; i++) {
      const text = `${replyPrefix}${i}`
      replyMessages.push(text)
      const input = bob.page.locator('[data-testid="message-input"]')
      await input.fill(text)
      await bob.page.locator('[data-testid="send-btn"]').click()
      if (i < burstCount - 1) {
        await bob.page.waitForTimeout(200)
      }
    }

    await snap(bob.page, 'bob-burst-replied')

    // Wait for replies, then recover any gaps on Alice's side
    await alice.page.waitForTimeout(5_000)
    const aliceGaps = await aliceMessages.recoverGaps()
    if (aliceGaps > 0) {
      await alice.page.waitForTimeout(3_000)
    }

    // Verify all replies arrived on Alice's side (after gap recovery)
    for (const text of replyMessages) {
      await expect(alice.page.locator(`text="${text}"`)).toBeVisible({ timeout: 30_000 })
    }

    await snap(alice.page, 'alice-burst-received-all')

    // Final verification: count total messages visible
    // Alice should see: burstCount sent + burstCount received = 10
    // Bob should see: burstCount received + burstCount sent = 10
    const aliceVisibleBurst = alice.page.locator(`text=/^${burstPrefix.replace('-', '\\-')}\\d$/`)
    const aliceVisibleReply = alice.page.locator(`text=/^${replyPrefix.replace('-', '\\-')}\\d$/`)
    await expect(aliceVisibleBurst).toHaveCount(burstCount, { timeout: 5_000 })
    await expect(aliceVisibleReply).toHaveCount(burstCount, { timeout: 5_000 })

    await snap(alice.page, 'final-burst-alice')
    await snap(bob.page, 'final-burst-bob')
  })
})
