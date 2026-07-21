# Doracle Nostr 数据逻辑文档

> 本文档梳理 Doracle 代码库中 Nostr 协议的使用条线，为新 UI 填充真实数据逻辑提供参考。

---

## 目录

1. [核心概念](#1-核心概念)
2. [认证流程](#2-认证流程)
3. [关键数据模型与类型](#3-关键数据模型与类型)
4. [状态管理 — Store 与 Hook 对照表](#4-状态管理--store-与-hook-对照表)
5. [Nostr 事件操作](#5-nostr-事件操作)
6. [Relay 管理](#6-relay-管理)
7. [数据加载与订阅](#7-数据加载与订阅)
8. [页面 → 数据映射表](#8-页面--数据映射表)

---

## 1. 核心概念

### 1.1 账号 (Account/Vault) vs 身份 (Identity)

Doracle 采用**两级身份管理**架构：

| 层级 | 概念 | 说明 |
|------|------|------|
| **账号** | 用户名 + 密码 | 解锁保险库 (Vault)；一个账号可管理多个身份；账号数据加密存储在 Nostr 网络上 |
| **身份** | Nostr 密钥对 (pubkey / nsec) | 用于签名和加密；私钥被账号主密钥加密后存储在 Vault 中 |

```
账号 (alice / password123)
  ├── 身份 A (npub1xxx) — 工作
  ├── 身份 B (npub1yyy) — 个人
  └── 身份 C (npub1zzz) — 测试
```

### 1.2 密钥派生链路

```
用户名 + 密码 + VAULT_SALT("doracle-vault-v1")
        │
        ▼
   SHA256(username:password:VAULT_SALT)
        │
        ▼
   主私钥 (Master Private Key, 32 bytes hex)
        │
        ├──► schnorr.getPublicKey() ──► 主公钥 (Master Public Key)
        │
        └──► PBKDF2(masterPrivateKey, salt="vault-aes-key-derivation", 100000 iterations, SHA-256)
                    │
                    ▼
              AES-GCM 256-bit 密钥
                    │
                    ├──► 加密 VaultData (整个保险库)
                    └──► 加密单个身份的 nsec (encryptedSecret)
```

**关键特性：**
- **确定性**：相同的用户名+密码总是产生相同的主密钥
- **主密钥不存储**：每次登录/解锁都重新从凭据派生
- **双层加密**：Vault 整体加密一次，其中每个身份的私钥再单独加密一次
- **加密格式**：`hex(IV):hex(ciphertext)`（IV 12 bytes, AES-GCM）

### 1.3 Vault 数据在 Nostr 网络上的存储

Vault 使用 **kind 31990**（参数化可替换事件）存储：

```javascript
{
  kind: 31990,
  pubkey: "<主公钥>",            // 由用户名+密码派生
  created_at: <timestamp>,
  tags: [["d", "doracle-vault"]],
  content: "<iv>:<ciphertext>",  // AES-GCM 加密后的 VaultData JSON
  sig: "<签名>"                  // 用主私钥签名
}
```

查询过滤器：

```json
{
  "kinds": [31990],
  "authors": ["<主公钥>"],
  "#d": ["doracle-vault"],
  "limit": 1
}
```

> 因为 kind 31990 是参数化可替换事件 (parameterized replaceable)，每个 pubkey + d-tag 组合只保留最新版本。

---

## 2. 认证流程

### 2.1 注册流程

```
用户输入 (用户名, 密码)
    │
    ▼
deriveMasterKey(username, password) → DerivedKey
    │
    ▼
checkVaultExists(masterPublicKey) → 必须为 false
    │
    ▼
createEmptyVaultData() → { version: 1, identities: [], updatedAt: now }
    │
    ▼
encryptVault(masterPrivateKey, vaultData) → "iv:ciphertext"
    │
    ▼
publishVaultEvent(kind=31990, d-tag="doracle-vault", content=加密数据)
    │
    ▼
设置会话状态 (unlocked=true, username, masterKey, identities=[])
    │
    ▼
startAutoLock() → 启动 20 秒自动锁定
    │
    ▼
导航到 /vault/select（创建或导入第一个身份）
```

**代码入口**: `vaultSession.register(username, password)`
**文件**: `src/engine/vault/sessionManager.ts`

### 2.2 登录流程

```
用户输入 (用户名, 密码)
    │
    ▼
deriveMasterKey(username, password) → DerivedKey
    │
    ▼
fetchVault(masterPublicKey, masterPrivateKey)
    ├── 查询 relay: kind=31990, authors=[masterPublicKey], #d=["doracle-vault"]
    ├── 获取 event.content
    └── decryptVault(masterPrivateKey, encryptedContent) → VaultData
    │
    ▼
设置会话状态 (unlocked=true, username, masterKey, identities=VaultData.identities)
    │
    ▼
startAutoLock()
    │
    ▼
如果 identityRestored=true → 导航到 /（自动恢复上次使用的身份）
如果 identityRestored=false → 导航到 /vault/select
```

**代码入口**: `vaultSession.unlock(username, password)`

### 2.3 解锁流程 (自动锁定后)

```
20 秒无活动 → lock()
    ├── unlockedStore.set(false)
    ├── masterKeyStore.set(null)
    ├── stopAutoLock()
    └── 保留 username 和 identities（用于 reUnlock）
    │
    ▼
UI 跳转到 /vault/unlock
    │
    ▼
用户输入密码
    │
    ▼
vaultSession.reUnlock(password)
    ├── 使用保留的 username 调用 unlock(username, password)
    └── 恢复会话
    │
    ▼
导航回之前页面
```

**活动检测事件**: `mousedown`, `keydown`, `touchstart`, `scroll`
**检查间隔**: 每 5 秒检测一次
**开发模式**: 自动锁定禁用（便于 E2E 测试）

### 2.4 身份切换

```
用户选择目标身份 (targetPubkey)
    │
    ▼
switchToIdentity(targetPubkey)
    ├── 在 identities 中查找 pubkey 匹配的身份
    ├── decryptSecret(masterPrivateKey, identity.encryptedSecret)
    │       └── AES-GCM 解密 → Nostr 私钥 (nsec)
    ├── loginWithNip01(privateKey)
    │       └── 设置全局 Nostr 签名密钥（pubkey store、session store、signer store）
    └── refreshActivity()
    │
    ▼
所有后续 Nostr 操作将使用该身份的密钥签名
```

**代码入口**: `vaultSession.switchToIdentity(pubkey)` (别名: `switchToAccount`)

---

## 3. 关键数据模型与类型

### 3.1 Vault 相关类型

**文件**: `src/engine/vault/types.ts`

```typescript
// 保险库中的单个身份
interface VaultIdentity {
  name: string              // 显示名称
  pubkey: string           // 公钥 (hex 格式)
  encryptedSecret: string  // AES-GCM 加密的私钥 (格式: iv:ciphertext)
  createdAt: number        // 创建时间戳 (ms)
  relayUrls?: string[]     // 可选的 relay URL
}

// 完整的保险库数据（加密存储在 Nostr 上）
interface VaultData {
  version: 1
  identities: VaultIdentity[]
  updatedAt: number
}

// 从用户名+密码派生的密钥
interface DerivedKey {
  privateKey: string  // 主私钥 (32 bytes hex)
  publicKey: string   // 主公钥 (32 bytes hex)
  npub: string       // bech32 编码公钥
  nsec: string       // bech32 编码私钥
}

// 会话状态
interface VaultSessionState {
  isUnlocked: boolean
  masterPublicKey: string | null
  accounts: VaultIdentity[]
  username: string | null
  lastActivity: number
}
```

**操作结果类型：**

```typescript
type VaultOperationResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

type VaultAuthResult = VaultOperationResult<{
  accounts: VaultIdentity[]
  masterPublicKey: string
  identityRestored?: boolean
}>
```

### 3.2 应用数据模型

**文件**: `src/engine/model.ts`

```typescript
// 会话（来自 @welshman/app）
type Session = {
  pubkey: string
  // 包含签名者接口和用户元数据
}

// 聊天频道
type Channel = {
  id: string                 // 排序后的参与者 pubkey 列表，逗号分隔
  last_sent?: number         // 最后发送消息时间
  last_received?: number     // 最后接收消息时间
  last_checked?: number      // 最后查看时间
  messages: TrustedEvent[]   // 频道内的消息事件
}

// 通知
type Notification = {
  key: string
  type: string
  root: string
  timestamp: number
  interactions: TrustedEvent[]
}

// 匿名用户状态（未登录时）
type AnonymousUserState = {
  follows: string[][]  // 关注标签
  relays: string[][]   // relay 标签
}
```

### 3.3 身份分享

**文件**: `src/domain/identity-share.ts`

```typescript
interface IdentityShare {
  v: number        // 版本号
  npub: string     // 公钥 (bech32)
  name?: string    // 昵称
  relay?: string   // 推荐 relay
  nip05?: string   // NIP-05 标识
  avatar?: string  // 头像 URL
}
```

支持两种分享格式：
- **URL**: `doracle://identity?v=1&npub=npub1xxx&name=Test&relay=wss://relay.example.com`
- **JSON 文件**: 导出为 `.json` 文件下载

---

## 4. 状态管理 — Store 与 Hook 对照表

### 4.1 Svelte Store → React Hook 桥接

**文件**: `src/util/store.ts`

Doracle 使用 React 的 `useSyncExternalStore` 桥接 Svelte store：

```typescript
// 订阅 Svelte Readable store
useStore<T>(store: Readable<T>): T

// 订阅 Svelte Writable store（带 setter）
useWritable<T>(store: Writable<T>): [T, (value: T | (prev: T) => T) => void]

// 带选择器的 store 订阅
useStoreSelector<T, S>(store: Readable<T>, selector: (value: T) => S): S
```

### 4.2 Vault Session Stores

**文件**: `src/engine/vault/sessionManager.ts` → `src/engine/vault/hooks.ts`

| Svelte Store | React Hook | 类型 | 说明 |
|:-------------|:-----------|:-----|:-----|
| `vaultSession.isUnlocked` | `useVaultUnlocked()` | `boolean` | 保险库是否已解锁 |
| `vaultSession.identities` | `useVaultIdentities()` | `VaultIdentity[]` | 当前账号的所有身份 |
| `vaultSession.accounts` | `useVaultAccounts()` | `VaultIdentity[]` | identities 的别名 |
| `vaultSession.username` | `useVaultUsername()` | `string \| null` | 当前登录的用户名 |
| `vaultSession.masterKey` | `useVaultMasterKey()` | `DerivedKey \| null` | 主密钥（锁定时为 null） |

### 4.3 核心 Nostr Store（来自 @welshman/app）

**文件**: `src/engine/state.ts`

| Store | React 用法 | 数据来源 | 说明 |
|:------|:-----------|:---------|:-----|
| `pubkey` | `useStore(pubkey)` | 身份切换时设置 | 当前用户公钥 |
| `session` | `useStore(session)` | loginWithNip01 设置 | 当前会话信息 |
| `signer` | `useStore(signer)` | loginWithNip01 设置 | 事件签名器 |
| `repository` | `useStore(repository)` | 自动从 relay 加载 | 事件仓库 (IndexedDB 缓存) |
| `plaintext` | `useStore(plaintext)` | 解密后写入 | 已解密内容 (NIP-04/NIP-44) |
| `profilesByPubkey` | `useStore(profilesByPubkey)` | kind 0 事件 | pubkey → 用户档案映射 |

### 4.4 用户数据 Store

| Store | 数据来源 (Kind) | 说明 |
|:------|:----------------|:-----|
| `userFollowList` | kind 3 (FOLLOWS) | 用户关注列表 |
| `userFollows` | 派生自 userFollowList | 关注的 pubkey 集合 |
| `userNetwork` | 派生自 follows 的 follows | 社交网络图谱 |
| `userMuteList` | kind 10000 (MUTES) | 静音列表 |
| `userMutedPubkeys` | 派生自 userMuteList | 被静音的 pubkey 集合 |
| `userMutedEvents` | 派生自 userMuteList | 被静音的事件 ID 集合 |
| `userMutedWords` | 派生自 userMuteList | 被静音的关键词集合 |
| `userPins` | kind 10001 (PINS) | 置顶事件 |
| `userRelayList` | kind 10002 (RELAYS) | Outbox relay 配置 (NIP-65) |
| `userSettings` | kind 30078 (APP_DATA) + 加密 | 用户设置（合并默认值） |
| `userLists` | kind 30000/30003/30004 | 用户自定义列表 |
| `userFeeds` | kind 31890 (FEED) | 用户自定义 feed |
| `userFeedFavorites` | kind 10014 (FEEDS) | 收藏的 feed 列表 |
| `messages` | kind 4 + kind 14 | 私信消息（新旧两种） |
| `channels` | 派生自 messages | 聊天频道（按参与者分组） |

### 4.5 UI 状态（Svelte writable）

**文件**: `src/app/state.ts`

| Store | 类型 | 说明 |
|:------|:-----|:-----|
| `menuIsOpen` | `Writable<boolean>` | 侧边菜单是否打开 |
| `searchTerm` | `Writable<string>` | 搜索关键词 |
| `slowConnections` | `Writable<string[]>` | 慢速连接列表 |
| `drafts` | `Map<string, any>` | 草稿存储（非响应式） |

### 4.6 用户设置默认值

```typescript
defaultSettings = {
  relay_limit: 3,           // relay 数量限制
  default_zap: 21,          // 默认 zap 金额 (sats)
  show_media: true,         // 显示媒体
  send_delay: 0,            // 发送延迟 (ms, 用于撤回)
  pow_difficulty: 0,        // PoW 难度
  muted_words: [],          // 静音词列表
  hide_sensitive: true,     // 隐藏敏感内容
  report_analytics: true,   // 报告分析数据
  min_wot_score: 0,         // 最低信任分数
  enable_client_tag: false, // 启用客户端标签
  auto_authenticate2: true, // 自动 NIP-42 认证
  upload_type: "blossom",   // 上传方式
  platform_zap_split: 0,    // 平台 zap 分成
}
```

---

## 5. Nostr 事件操作

### 5.1 事件创建、签名、发布链路

**文件**: `src/engine/commands.ts`

```
1. 创建事件模板 (EventTemplate)
       │
       ▼
2. sign(template, opts?)
       ├── 匿名模式: 创建一次性 Nip01Signer
       ├── 指定 sk: 使用指定私钥签名
       └── 默认: 使用当前 session 的 signer 签名
       │
       ▼
3. Router.get().PublishEvent(event) → 确定目标 relay
       │
       ▼
4. publishThunk({event, relays}) → 发布到 relay
```

核心函数：

```typescript
// 签名
async sign(template: EventTemplate, opts?: {anonymous?: boolean; sk?: string}): Promise<SignedEvent>

// 签名并发布
async signAndPublish(template, {anonymous?}): Promise<PublishedEvent>

// 删除事件
publishDeletion({kind, address?, id?})  // 创建 kind 5 事件
deleteEvent(event)                       // 按事件删除
deleteEventByAddress(address)            // 按地址删除
```

### 5.2 各种 Kind 事件用途对照表

#### 常规事件

| Kind | 名称 | 用途 | 可替换 |
|:-----|:-----|:-----|:-------|
| 0 | PROFILE | 用户档案 | 是 (replaceable) |
| 1 | NOTE | 短文本笔记 | 否 |
| 3 | FOLLOWS | 关注列表 | 是 |
| 4 | DEPRECATED_DIRECT_MESSAGE | 旧版加密私信 | 否 |
| 5 | DELETE | 删除事件 | 否 |
| 6 | REPOST | 转发 | 否 |
| 7 | REACTION | 表情回应 | 否 |
| 14 | DIRECT_MESSAGE | NIP-17 加密私信（现代版） | 否 |
| 15 | DIRECT_MESSAGE_FILE | 私信文件 | 否 |
| 20 | PICTURE_NOTE | 图片笔记 | 否 |
| 1059 | WRAP | NIP-17 礼物包装（加密信封） | 否 |
| 1111 | COMMENT | 评论/回复 | 否 |
| 1985 | LABEL | 标签/分类 | 否 |

#### 元数据列表 (替换型, kind 10000+)

| Kind | 名称 | 用途 |
|:-----|:-----|:-----|
| 10000 | MUTES | 静音的 pubkey/词/事件 |
| 10001 | PINS | 置顶事件 |
| 10002 | RELAYS | Outbox relay 列表 (NIP-65) |
| 10003 | BOOKMARKS | 书签 |
| 10005 | CHANNELS | 群聊频道 |
| 10014 | FEEDS | Feed 收藏列表 |
| 10050 | MESSAGING_RELAYS | 接收私信的 relay (NIP-17) |

#### 参数化可替换事件 (kind 30000+)

| Kind | 名称 | 用途 |
|:-----|:-----|:-----|
| 30000 | NAMED_PEOPLE | 自定义人物列表 |
| 30002 | NAMED_RELAYS | 自定义 relay 列表 |
| 30003 | NAMED_BOOKMARKS | 命名书签集 |
| 30004 | NAMED_CURATIONS | 内容策展列表 |
| 30078 | APP_DATA | 应用加密数据（存储用户设置） |
| 31890 | FEED | Feed 定义 |
| 31989 | HANDLER_RECOMMENDATION | 处理器推荐 |
| 31990 | HANDLER_INFORMATION | 处理器信息（**也用于 Vault 存储**） |

#### 特殊 Kind

| Kind | 名称 | 用途 |
|:-----|:-----|:-----|
| 24242 | BLOSSOM_AUTH | 文件上传认证 (Blossom 协议) |
| 28934 | RELAY_JOIN | 请求加入 relay |

### 5.3 DM 加密发送流程 (NIP-17 Gift Wrap)

```
发送方 Alice → 接收方 Bob
    │
    ▼
1. 创建明文消息事件 (kind 14, DIRECT_MESSAGE)
   { content: "Hello!", tags: [["p", bobPubkey], ["expiration", ts]] }
    │
    ▼
2. sendWrapped({recipients: [bobPubkey, alicePubkey], event, delay})
    │
    ▼
3. 对每个接收者:
   a. NIP-44 加密明文事件 → SEAL (kind 13)
   b. 包装 SEAL → WRAP (kind 1059, 礼物包装)
   c. 发布 WRAP 到接收者的 messaging relays
    │
    ▼
接收方收到 kind 1059 事件
    │
    ▼
4. 解密流程:
   a. repository 存储 kind 1059 事件
   b. nip44.decrypt() 解开 WRAP → SEAL → 明文
   c. 写入 plaintext store
   d. UI 显示解密后的消息
```

**涉及的 Kind**:
- Kind 14: 实际的私信内容
- Kind 13: SEAL（中间加密层）
- Kind 1059: WRAP（最外层礼物包装）
- Kind 4: 旧版私信（向后兼容，已废弃）

**撤回发送**：`sendMessage` 支持 `delay` 参数，可在发送前提供撤回窗口。

### 5.4 文件上传 (Blossom 协议)

**文件**: `src/engine/commands.ts`

```
1. 图片预处理（非 webp/gif 时剥离 EXIF 数据）
       │
       ▼
2. 计算 sha256(file.arrayBuffer()) → hashes
       │
       ▼
3. 创建认证事件: makeBlossomAuthEvent({action: "upload", server, hashes})
       │
       ▼
4. 签名认证事件 (kind 24242)
       │
       ▼
5. uploadBlob(server, file, {authEvent})
       │
       ▼
6. 返回 { url: string, ... }
```

### 5.5 用户设置的存储

```
用户修改设置
    │
    ▼
publishSettings(settings)
    │
    ▼
setAppData("USER_SETTINGS", settings)
    │
    ▼
创建 kind 30078 (APP_DATA) 事件
    ├── tags: [["d", "USER_SETTINGS"]]
    ├── content: signer.nip04.encrypt(pubkey, JSON.stringify(settings))
    └── 发布到用户 relay
    │
    ▼
加载时:
    ├── 查询 kind 30078, authors=[pubkey], #d=["USER_SETTINGS"]
    ├── 解密 content
    └── 合并默认值 → userSettings store
```

---

## 6. Relay 管理

### 6.1 Relay 类型

| 类型 | Kind | 用途 | 配置方式 |
|:-----|:-----|:-----|:---------|
| **Outbox Relays** | 10002 (RELAYS) | 发布/读取用户事件 (NIP-65) | `setOutboxPolicy(url, read, write)` |
| **Messaging Relays** | 10050 (MESSAGING_RELAYS) | 接收 NIP-17 加密私信 | `setMessagingPolicy(url, enabled)` |
| **Chat Relays** | localStorage | 聊天专用 relay | `saveChatRelays(urls)` |
| **Default Relays** | env.DEFAULT_RELAYS | 环境变量配置的默认 relay | `.env` |
| **Indexer Relays** | env.INDEXER_RELAYS | 搜索/发现 | `.env` |
| **Search Relays** | env.SEARCH_RELAYS | 全文搜索 | `.env` |

### 6.2 Relay 选择策略 (Router)

Router 根据操作类型智能选择 relay：

```typescript
// 发布事件 → 用户的 outbox relay
Router.get().PublishEvent(event).getUrls()

// 获取用户数据 → 用户的 outbox relay + fallback
Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

// 获取特定用户事件 → 目标用户的 relay
Router.get().FromPubkeys(pubkeys).getUrls()

// 搜索 → 搜索专用 relay
Router.get().Search().getUrls()
```

### 6.3 加入/离开 Relay

```typescript
// 加入 relay
joinRelay(url, claim?)
  1. 规范化 URL
  2. 如有 claim: 发布 kind 28934 (RELAY_JOIN) 事件到该 relay
  3. setOutboxPolicy(url, read=true, write=true)  // 更新 kind 10002
  4. broadcastUserData([url])  // 向新 relay 发布用户元数据

// 离开 relay
leaveRelay(url)
  1. setMessagingPolicy(url, false)  // 从 kind 10050 移除
  2. setOutboxPolicy(url, false, false)  // 从 kind 10002 移除
  3. broadcastUserData([url])
```

### 6.4 Chat Relay

**文件**: `src/engine/utils/relay-policy.ts`

```typescript
getChatRelays(): RelaySet
  // 优先: localStorage("chat_relays") 中配置的 relay
  // 默认: ["wss://relay.damus.io", "wss://nos.lol"]

saveChatRelays(relayUrls: string[])
  // 保存到 localStorage("chat_relays")
```

Chat relay 独立于 Outbox relay，专用于收发聊天消息。

---

## 7. 数据加载与订阅

### 7.1 loadUserData() — 启动时加载清单

**文件**: `src/app/state.ts`

```typescript
export const loadUserData = async () => {
  // Phase 1: 先加载 relay 配置（后续数据依赖此配置）
  await loadUserRelayList()                    // kind 10002

  // Phase 2: 并行加载核心用户数据
  await Promise.all([
    loadUserMessagingRelayList(),              // kind 10050
    loadUserBlossomServerList(),               // Blossom 服务器列表
    loadUserProfile(),                         // kind 0
    loadUserFollowList(),                      // kind 3
    loadUserMuteList(),                        // kind 10000
  ])

  // Phase 3: 加载 feed 和应用数据
  myLoad({
    filters: [
      {authors: [pubkey], kinds: [FEEDS]},     // kind 10014
      {authors: [pubkey], kinds: [APP_DATA],   // kind 30078
       "#d": Object.values(appDataKeys)},
    ],
  })

  // Phase 4: 加载 WoT（信任网络）
  loadPubkeys(getFollows(pubkey))              // 关注者的 profile + follows

  // Phase 5: 实时数据
  loadMessages()                               // 私信 (kind 4 + 1059)
  loadNotifications()                          // 通知 (提及、回应)
  loadFeedsAndLists()                          // 自定义 feed 和列表
  loadDeletes()                                // 删除事件 (kind 5)
  listenForNotifications()                     // 订阅实时通知
}
```

### 7.2 request vs load vs pull 的区别

| 函数 | 行为 | 使用场景 |
|:-----|:-----|:---------|
| `myRequest(options)` | **流式订阅**，持续接收新事件 | 实时通知、消息监听 |
| `myLoad(options)` | **批量加载**，获取所有匹配事件后完成 | 启动时加载、一次性查询 |
| `pullConservatively({relays, filters})` | **增量同步**，避免重复拉取 | 消息同步 |

三者都会自动加入 `LOCAL_RELAY_URL`（本地缓存 relay），除非指定 `skipCache: true`。

```typescript
// pullConservatively 的智能策略:
// - 支持 negentropy 的 relay → pull() 高效增量同步
// - 不支持的 relay → 仅拉取最近 100 条（避免重复浪费）
```

### 7.3 本地缓存 (IndexedDB + Repository)

**文件**: `src/engine/storage.ts`

数据库名: `doracle`, 版本: 9

| Object Store | KeyPath | 同步目标 | 说明 |
|:-------------|:--------|:---------|:-----|
| `events` | `id` | repository | 事件缓存，上限 10,000 条 |
| `relays` | `url` | relaysByUrl | relay 元数据缓存 |
| `plaintext` | `key` | plaintext store | 已解密内容，每 10 秒保存 |
| `tracker` | `id` | Tracker | relay ↔ 事件关联 |
| `wraps` | `id` | WrapManager | NIP-17 gift wrap 缓存 |
| `handles` | `key` | — | NIP-05 解析缓存 |
| `zappers` | `key` | — | Zapper 信息缓存 |

**事件驱逐策略** (EventsStorageAdapter):
- 超过 15,000 条时触发清理
- 优先保留：自己的事件、被提及的事件、关注用户的元数据 (rank=1)
- 低优先级事件被删除 (rank=0)

**启动加载顺序**:
1. `initStorage()` 打开 IndexedDB
2. 从缓存加载事件到 repository
3. 从缓存加载已解密内容到 plaintext store
4. 从缓存加载 relay 关联到 tracker
5. 应用就绪后开始网络同步

---

## 8. 页面 → 数据映射表

### 8.1 路由注册

**文件**: `src/App.tsx`

```typescript
router.register("/", HomePage)
router.register("/chat/:targetPubkey", ChatPage, { requireSigner: true, serializers: { targetPubkey: asPerson } })
router.register("/contacts", ContactsPage)
router.register("/settings", SettingsPage, { requireSigner: true })
router.register("/about", About)
router.register("/qrcode/:code", QRCodePage, { serializers: { code: asUrlComponent("code") } })
router.register("/vault/login", VaultLoginPage)
router.register("/vault/select", VaultIdentitySelectPage)
router.register("/vault/unlock", VaultUnlockPage)
```

### 8.2 路由守卫逻辑

**文件**: `src/App.tsx`

```
请求访问任意路由
      │
      ▼
是公开路由? (/vault/login, /vault/unlock, /about)
      ├── 是 → 直接渲染
      └── 否 ↓
              │
              ▼
         isVaultUnlocked?
              ├── 否 → redirect to /vault/login
              └── 是 ↓
                      │
                      ▼
                 是 Vault 路由? (/vault/select)
                      ├── 是 → 直接渲染
                      └── 否 ↓
                              │
                              ▼
                         currentPubkey 存在?
                              ├── 否 → redirect to /vault/select
                              └── 是 → 渲染页面组件
```

三层分类：
- **PUBLIC_ROUTES**: `/vault/login`, `/vault/unlock`, `/about` — 无需任何认证
- **VAULT_ROUTES**: `/vault/select` — 需要 Vault 已解锁，但无需选择身份
- **PROTECTED_ROUTES**: 其余所有路由 — 需要 Vault 已解锁 + 身份已选择

### 8.3 各页面数据依赖

| 页面 | 路由 | 认证需求 | 使用的 Store / Hook | 主要数据操作 |
|:-----|:-----|:---------|:--------------------|:------------|
| **VaultLoginPage** | `/vault/login` | 无 | `vaultSession` | `unlock()`, `register()` |
| **VaultUnlockPage** | `/vault/unlock` | 无 | `vaultSession` | `reUnlock()`, `logout()` |
| **VaultIdentitySelectPage** | `/vault/select` | Vault 解锁 | `useVaultAccounts()`, `useStore(pubkey)`, `useStore(userFollowList)` | `switchToAccount()`, `createAccount()`, `addAccount()`, `loadUserData()` |
| **HomePage** | `/` | 身份已选 | `useStore(pubkey)`, `useStore(userFollowList)`, `useStore(profilesByPubkey)` | `repository.query()` 加载私信，localStorage 读取 last_seen |
| **ChatPage** | `/chat/:targetPubkey` | 身份+Signer | `useStore(pubkey)`, `useStore(signer)`, `useStore(profilesByPubkey)` | `sendMessage()`, MessageTTLManager, `wrapManager.on("add")`, `getChatRelays()` |
| **ContactsPage** | `/contacts` | 身份已选 | `useStore(userFollowList)`, `useStore(signer)`, `useStore(profilesByPubkey)` | 发布 kind 3 事件（添加/删除联系人） |
| **SettingsPage** | `/settings` | 身份+Signer | `useStore(pubkey)`, `useVaultAccounts()` | Chat relay 管理, Message TTL, 语言切换, 清除聊天记录, `logout()` |
| **About** | `/about` | 无 | (无) | 静态信息展示 |

### 8.4 消息 TTL 管理

**文件**: `src/engine/utils/message-ttl.ts`

```typescript
class MessageTTLManager {
  add(event, ttl?)       // 添加带过期时间的消息
  getValidMessages()     // 获取未过期消息（按时间倒序）
  getRemainingTime(id)   // 剩余时间（秒）
  isMessageExpired(id)   // 是否已过期
  onExpired(callback)    // 监听过期事件
  start() / stop()       // 启停定时检查（1 秒间隔）
}
```

使用 NIP-40 过期标签：`["expiration", "<unix_timestamp>"]`

### 8.5 通知系统

**文件**: `src/engine/notifications.ts`

| Store | 说明 |
|:------|:-----|
| `mainNotifications` | 提及用户的笔记（排除自己和静音的） |
| `reactionNotifications` | 对用户事件的回应 |
| `unreadMainNotifications` | 未读提及 |
| `unreadReactionNotifications` | 未读回应 |
| `hasNewNotifications` | 是否有新通知 |

已读状态通过 `checked` store（synced to localStorage）追踪：

```typescript
setChecked(path, timestamp?)  // 标记已读
isSeen(path, event)           // 检查是否已读
getSeenAt(path, event)        // 获取已读时间
```

---

## 附录: 关键文件索引

| 文件路径 | 职责 |
|:---------|:-----|
| `src/engine/vault/types.ts` | Vault 类型定义和常量 |
| `src/engine/vault/keyDerivation.ts` | 主密钥派生 (SHA256 + schnorr) |
| `src/engine/vault/vaultCrypto.ts` | AES-GCM 加密/解密 (PBKDF2 密钥派生) |
| `src/engine/vault/vaultSync.ts` | Vault 与 Nostr relay 同步 |
| `src/engine/vault/sessionManager.ts` | 会话管理（登录/注册/锁定/身份切换） |
| `src/engine/vault/hooks.ts` | Vault React hooks |
| `src/engine/state.ts` | 核心 store 定义和设置 |
| `src/engine/commands.ts` | 事件创建/签名/发布 |
| `src/engine/requests.ts` | 数据加载和 relay 请求 |
| `src/engine/storage.ts` | IndexedDB 存储适配器 |
| `src/engine/model.ts` | 数据模型类型定义 |
| `src/engine/notifications.ts` | 通知聚合和已读状态 |
| `src/engine/utils/relay-policy.ts` | Chat relay 管理 |
| `src/engine/utils/message-ttl.ts` | 消息过期管理 (NIP-40) |
| `src/util/store.ts` | Svelte store → React hook 桥接 |
| `src/util/router.ts` | 自定义路由器实现 |
| `src/util/router-hooks.ts` | 路由 React hooks |
| `src/app/state.ts` | 应用级状态 (loadUserData, UI state) |
| `src/app/util/router.ts` | 路由参数序列化器 |
| `src/App.tsx` | 路由注册和守卫 |
| `src/domain/identity-share.ts` | 身份分享 (doracle:// URL + JSON) |
| `src/nip.ts` | NIP 实现、密钥编码 |
