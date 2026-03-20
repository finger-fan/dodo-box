// empty-adapter.ts - No-op adapter for SSR and unauthenticated states

import type {
  INostrAdapter,
  NostrChat,
  NostrMessage,
  NostrContact,
  NostrProfile,
  NostrResult,
} from './types'

export class EmptyNostrAdapter implements INostrAdapter {
  async getChats(): Promise<NostrChat[]> {
    return []
  }

  async getMessages(): Promise<NostrMessage[]> {
    return []
  }

  async sendMessage(): Promise<NostrResult<NostrMessage>> {
    return { success: false, error: 'Not authenticated' }
  }

  subscribeToMessages(): () => void {
    return () => {}
  }

  async getContacts(): Promise<NostrContact[]> {
    return []
  }

  async addContact(): Promise<NostrResult<NostrContact>> {
    return { success: false, error: 'Not authenticated' }
  }

  async removeContact(): Promise<NostrResult> {
    return { success: false, error: 'Not authenticated' }
  }

  async getProfile(): Promise<NostrProfile | null> {
    return null
  }

  async updateProfile(): Promise<NostrResult> {
    return { success: false, error: 'Not authenticated' }
  }

  getRelays(): string[] {
    return []
  }

  async setRelays(): Promise<NostrResult> {
    return { success: false, error: 'Not authenticated' }
  }
}
