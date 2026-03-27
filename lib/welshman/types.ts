// types.ts - Welshman type re-exports and mappings to dodo-box types

// Event types from welshman
export type {
  EventContent,
  EventTemplate,
  StampedEvent,
  OwnedEvent,
  HashedEvent,
  SignedEvent,
  TrustedEvent,
} from '@welshman/util'

// Filter type from welshman
export type { Filter } from '@welshman/util'

// Kind constants — re-export welshman's canonical names
export {
  PROFILE,
  FOLLOWS,
  DIRECT_MESSAGE,
  WRAP,
  MESSAGING_RELAYS,
  HANDLER_INFORMATION,
} from '@welshman/util'

// Signer interface
export type { ISigner } from '@welshman/signer'

// Publish types
export { PublishStatus } from '@welshman/net'
export type { PublishResult, PublishResultsByRelay } from '@welshman/net'

// Repository update type
export type { RepositoryUpdate } from '@welshman/net'

// Socket status
export { SocketStatus } from '@welshman/net'
