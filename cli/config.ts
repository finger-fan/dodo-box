// config.ts — Configuration management for CLI
// Handles loading/saving CLI config with defaults

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface CliConfig {
  relays: string[]
  username: string
  password: string
  defaultRelays: string[]
  autoReconnect: boolean
  maxRetries: number
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

const DEFAULT_CONFIG: Omit<CliConfig, 'username' | 'password'> = {
  relays: [...DEFAULT_RELAYS],
  defaultRelays: [...DEFAULT_RELAYS],
  autoReconnect: true,
  maxRetries: 3,
}

export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS]
}

export function getConfigPath(configDir: string): string {
  return join(configDir, 'config.json')
}

export function loadConfig(configDir: string): CliConfig | null {
  const configFile = getConfigPath(configDir)

  if (!existsSync(configFile)) return null

  try {
    const raw = readFileSync(configFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<CliConfig>

    // Merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    } as CliConfig
  } catch {
    return null
  }
}

export function saveConfig(configDir: string, config: CliConfig): void {
  const configFile = getConfigPath(configDir)
  writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8')
}

export function updateRelays(configDir: string, relays: string[]): void {
  const existing = loadConfig(configDir)
  const config: CliConfig = {
    ...DEFAULT_CONFIG,
    ...(existing || {}),
    relays: [...relays],
    defaultRelays: [...relays],
  } as CliConfig
  saveConfig(configDir, config)
}
