// storage.ts - Centralized localStorage utility with encryption support
import CryptoJS from 'crypto-js'

const DEFAULT_PREFIX = 'dodobox_'

export const StorageKey = {
  SESSION: 'dodobox_session',
  ACCOUNT_ACTIVE: 'dodobox_account_active',
  CURRENT_USER: 'dodobox_current_user',
  ADAPTER_MODE: 'dodobox_adapter_mode',
  MESSAGE_TTL: 'dodobox_message_ttl',
  MASK_SECONDS: 'dodobox_mask_seconds',
  MASK_CHARSET: 'dodobox_mask_charset',
  MASK_SWIPE_ENABLED: 'dodobox_mask_swipe_enabled',
  MASK_SWIPE_THRESHOLD: 'dodobox_mask_swipe_threshold',
  ALLOW_SCREENSHOT: 'dodobox_allow_screenshot',
  CONTACT_CACHE: 'dodobox_contact_cache',
  REFRESH_LOGOUT: 'dodobox_refresh_logout',
  CONTACTS_CACHE: 'dodobox_contacts_cache',
  CHATS_CACHE: 'dodobox_chats_cache',
  SEQ_COUNTER: 'dodobox_seq',
  USER_RELAYS: 'dodobox_user_relays',
  RELAY_QUALITY: 'dodobox_relay_quality',
} as const

export type StorageKeyType = typeof StorageKey[keyof typeof StorageKey]

class Store {
  private pubkey: string = "9e80ss&8237$U32dSDG&&#96459cb4d4aaeaf1c47b" + 5347;
  private valueSalt: string = "va16E3a17"

  private encryptValue(value: string): string {
    if (!this.pubkey || !this.valueSalt) return value
    return CryptoJS.AES.encrypt(value, this.pubkey + this.valueSalt).toString()
  }

  private decryptValue(encrypted: string): string {
    if (!this.pubkey || !this.valueSalt) return encrypted
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, this.pubkey + this.valueSalt)
      return bytes.toString(CryptoJS.enc.Utf8)
    } catch {
      return encrypted
    }
  }

  // 加密操作
  get<T>(key: StorageKeyType | string, fallback?: T): T | undefined {
    if (typeof window === 'undefined') return fallback
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback

      const decrypted = this.decryptValue(raw)
      // console.log("get", key, decrypted)

      // 检查是否有类型标签
      if (decrypted.includes('@@')) {
        const idx = decrypted.indexOf('@@')
        const type = decrypted.substring(0, idx)
        const value = decrypted.substring(idx + 2)

        if (type === 'string') {
          return value as T
        } else if (type === 'object') {
          return JSON.parse(value) as T
        }
      }

      // 兼容旧数据：没有标签，尝试 JSON.parse
      try {
        return JSON.parse(decrypted) as T
      } catch {
        return decrypted as T
      }
    } catch {
      return fallback
    }
  }

  set<T>(key: StorageKeyType | string, value: T): void {
    if (typeof window === 'undefined') return
    try {
      // 添加类型标签
      let serialized: string
      if (typeof value === 'string') {
        serialized = 'string@@' + value
      } else {
        serialized = 'object@@' + JSON.stringify(value)
      }
      // console.log("set", key, serialized)
      const encrypted = this.encryptValue(serialized)
      localStorage.setItem(key, encrypted)
    } catch {}
  }

  remove(key: StorageKeyType | string): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(key)
    } catch {}
  }
}

export const store = new Store()
