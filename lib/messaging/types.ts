// types.ts - CLI messaging types
// Shared between CLI and future UI

export type DeliveryStatus = 'pending' | 'sent' | 'failed'

export interface CliMessage {
  id: string
  text: string
  direction: 'outgoing' | 'incoming'
  senderPubkey: string
  timestamp: Date
  seq?: number
  status?: DeliveryStatus
}

export interface Contact {
  pubkey: string
  name?: string
  lastSeen?: Date
}

export interface Conversation {
  contactPubkey: string
  contactName?: string
  messages: CliMessage[]
  unreadCount: number
}

export interface RelayConnectionStatus {
  url: string
  connected: boolean
  error?: string
}
