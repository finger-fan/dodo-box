// types.ts - Nostr 相关类型定义

export const VAULT_SALT = process.env.NEXT_PUBLIC_VAULT_SALT || 'dodobox-vault-v1'
export const VAULT_EVENT_D_TAG = 'doracle-vault'

export const KIND_PROFILE = 0
export const KIND_FOLLOWS = 3
export const KIND_DIRECT_MESSAGE = 14
export const KIND_DM_WRAP = 1059
export const KIND_VAULT = 31990

export interface VaultIdentity {
  name: string
  slogan?: string
  pubkey: string
  encryptedSecret: string
  createdAt: number
  relayUrls?: string[]
}

export interface VaultData {
  version: 1
  identities: VaultIdentity[]
  updatedAt: number
}

export interface DerivedKey {
  privateKey: string
  publicKey: string
  npub: string
  nsec: string
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed'

export interface NostrMessage {
  id: string
  text: string
  sender: 'me' | 'them'
  timestamp: Date
  senderPubkey?: string
  seq?: number
  sendStatus?: DeliveryStatus
}

export interface NostrChat {
  id: string
  pubkey: string
  name: string
  lastMsg: string
  time: string
  unread: number
  avatar: string
}

export interface NostrContact {
  id: string
  name: string
  pubkey: string
  avatar?: string
}

export interface NostrProfile {
  pubkey: string
  name?: string
  displayName?: string
  picture?: string
  about?: string
  nip05?: string
}

export interface NostrSession {
  isAuthenticated: boolean
  username: string | null
  currentPubkey: string | null
  vaultData: VaultData | null
}

export type NostrResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export type NostrFilter = {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  search?: string
  [key: `#${string}`]: string[]
}

export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface INostrAdapter {
  getChats(): Promise<NostrChat[]>
  getMessages(contactPubkey: string): Promise<NostrMessage[]>
  sendMessage(contactPubkey: string, text: string): Promise<NostrResult<NostrMessage>>
  subscribeToMessages(
    contactPubkey: string,
    callback: (msg: NostrMessage) => void
  ): () => void
  getContacts(): Promise<NostrContact[]>
  addContact(pubkeyOrNpub: string): Promise<NostrResult<NostrContact>>
  removeContact(pubkey: string): Promise<NostrResult>
  getProfile(pubkey: string): Promise<NostrProfile | null>
  updateProfile(profile: Partial<NostrProfile>): Promise<NostrResult>
  getRelays(): string[]
  setRelays(relays: string[]): Promise<NostrResult>
  recoverMessages(
    contactPubkey: string,
    since: number,
    until: number
  ): Promise<NostrMessage[]>
}

export const VAULT_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  VAULT_NOT_FOUND: 'VAULT_NOT_FOUND',
  VAULT_EXISTS: 'VAULT_EXISTS',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  SYNC_FAILED: 'SYNC_FAILED',
  SESSION_LOCKED: 'SESSION_LOCKED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_KEY: 'INVALID_KEY',
} as const

export type VaultErrorCode = (typeof VAULT_ERROR_CODES)[keyof typeof VAULT_ERROR_CODES]

export class VaultError extends Error {
  constructor(
    message: string,
    public code: VaultErrorCode
  ) {
    super(message)
    this.name = 'VaultError'
  }
}
