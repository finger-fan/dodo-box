# Welshman 移植计划 — dodo-box Nostr 层全面重构

> 基于 Coracle (@welshman v0.8.7) 架构，替换 dodo-box 自建 Nostr 实现

## 背景

当前问题：
1. seq counter 存 localStorage，跨设备丢失
2. 无 IndexedDB 持久化，每次重新拉取消息
3. 发送状态刷新后丢失
4. 无 per-relay 发布跟踪
5. gap detection 需用户手动介入
6. 固定 5 秒超时拉取消息
7. 无 relay 质量评分和智能路由

目标：移植 welshman 全套机制，彻底解决消息可靠性问题。

---

## 依赖变更

### 新增
```
@welshman/lib       ^0.8.7   # 核心工具函数
@welshman/util      ^0.8.7   # 事件类型、过滤器、kind 常量
@welshman/net       ^0.8.7   # Repository, Tracker, WrapManager, Socket/Pool, publish
@welshman/signer    ^0.8.7   # Nip59 gift wrap, 签名
@welshman/router    ^0.8.7   # relay 路由选择
@welshman/app       ^0.8.7   # Thunk 系统, sendWrapped, 高级 store
idb                 ^8.0.2   # IndexedDB 封装
```

### 保留
```
nostr-tools         ^2.23.3  # welshman 内部也依赖，无冲突
```

---

## 架构总览

```
┌─ React Hooks 层 ─────────────────────────────────────┐
│ use-messages / use-chats / use-contacts / use-profile │
│   ↕ useSyncExternalStore 桥接 welshman stores         │
└──────────────┬────────────────────────────────────────┘
               │ INostrAdapter 接口（保留）
┌─ Adapter 层 ─┴───────────────────────────────────────┐
│ RealNostrAdapter → 薄代理，委托 welshman 模块         │
│ EmptyNostrAdapter → 保留不变                          │
└──────────────┬────────────────────────────────────────┘
               │
┌─ Welshman 集成层 (lib/welshman/) ────────────────────┐
│ engine.ts       → 单例初始化 Repository/Pool/Tracker  │
│ store-adapter.ts → Svelte store → React hook 桥接     │
│ relay-manager.ts → @welshman/net Pool 封装            │
│ crypto.ts       → @welshman/signer Nip59 封装         │
│ publish.ts      → Thunk 发布 + per-relay 状态跟踪     │
│ storage.ts      → IndexedDB 持久化 (idb)              │
│ message-store.ts → Repository 查询 + 消息派生          │
│ router-config.ts → @welshman/router 路由策略           │
│ relay-quality.ts → relay 质量评分                      │
│ types.ts        → welshman 类型映射                    │
└──────────────┬────────────────────────────────────────┘
               │
┌─ 保留不变 ───┴───────────────────────────────────────┐
│ vault-crypto.ts / vault-sync.ts / key-derivation.ts   │
│ gap-detection.ts / types.ts (INostrAdapter)            │
└──────────────────────────────────────────────────────┘
```

---

## 分阶段实施

### Phase 0: 基础设施 — Welshman 集成层 (2-3 天)

**目标**: 安装依赖，建立 Svelte→React 桥接，初始化 welshman 引擎单例。

#### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/welshman/store-adapter.ts` | ~80 | `useWelshmanStore<T>(store)` — 用 `useSyncExternalStore` 桥接 welshman 的 `{ subscribe, get }` store 模式。SSR 时返回默认值 |
| `lib/welshman/engine.ts` | ~120 | 单例：懒初始化 `repository` (Repository), `tracker` (Tracker), `pool` (Pool)。`typeof window !== 'undefined'` 守护 SSR |
| `lib/welshman/types.ts` | ~40 | welshman 类型 re-export + 映射到 dodo-box 类型名 |

#### 修改文件
无（纯新增）

#### 测试
- `useWelshmanStore` hook 单元测试 (mock store)
- SSR 环境返回默认值验证

#### 验收标准
- `pnpm check` 通过
- welshman 引擎可在客户端正常初始化
- SSR 不报错

---

### Phase 1: 替换 Relay 层 + 事件签名 (3-4 天)

**目标**: 用 welshman 的 Pool/Socket 替换自建 RelayClient/RelayPool，用 Nip59 替换自建 gift wrap。

#### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/welshman/relay-manager.ts` | ~100 | 封装 `@welshman/net` Pool。提供 `connectToRelays()`, `publishEvent()`, `subscribe()` |
| `lib/welshman/crypto.ts` | ~80 | 封装 `@welshman/signer` Nip59。替换 `createGiftWrap()` / `decryptGiftWrap()` |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/nostr/real-adapter.ts` | `relayPool` → `getRelayManager()` |
| `lib/nostr/vault-sync.ts` | `relayPool` → `getRelayManager()` |
| `contexts/NostrContext.tsx` | `relayPool` → `getRelayManager()` |
| `lib/nostr/events.ts` | 重写为 welshman/crypto.ts 的薄包装，保持函数签名 |

#### 删除文件

| 文件 | 行数 | 原因 |
|------|------|------|
| `lib/nostr/relay-client.ts` | 190 | 完全被 relay-manager.ts 替代 |

#### 关键设计

`relayPool` 单例被 4 个文件引用。新 `relay-manager.ts` 暴露相同单例模式 `getRelayManager()`，迁移只需改 import。

welshman 内置 Socket 管理：
- 自动重连（无需手动指数退避）
- 连接状态追踪 (Open/Opening/Closing/Closed/Error)
- 内置发送队列

#### 测试
- relay-manager 单元测试
- gift wrap 加解密验证（NIP-17 合规）
- 运行现有 `nostr-adapter.test.ts` 集成测试

---

### Phase 2: Repository + IndexedDB 存储 (3-4 天)

**目标**: 引入 Repository 作为中心事件存储，IndexedDB 持久化，消除固定超时。

#### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/welshman/storage.ts` | ~150 | IndexedDB 初始化 + 存储适配器。启动时从 IDB 加载到 Repository，Repository "update" 事件同步回 IDB |
| `lib/welshman/message-store.ts` | ~120 | 从 Repository 查询/派生消息列表。替换 adapter 中每次从 relay 重新拉取的模式 |

#### IndexedDB Schema

```
Database: "dodobox-nostr" (version 1)

Store: "events"
  keyPath: "id"
  indexes: [by-kind, by-pubkey, by-kind-pubkey, by-created-at]
  内容: 解密后的 DM 事件 (kind 14)
  保留策略: 最多 10,000 条，超过时按时间裁剪

Store: "tracker"
  keyPath: "eventId"
  内容: { eventId, relays: string[] }  // 事件在哪些 relay 上看到过

Store: "wraps"
  keyPath: "wrapId"
  内容: { wrapId, rumorId, decryptedAt }  // gift wrap ↔ rumor 映射，避免重复解密
```

**注意**: 不存联系人和敏感数据到 IndexedDB（遵守用户反馈约束）。

#### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/welshman/engine.ts` | 添加 Repository 初始化，接入 storage 适配器 |
| `lib/nostr/real-adapter.ts` | `getMessages()` 先查 Repository（即时），再订阅 relay 增量。用 EOSE 替代 5 秒超时 |
| `hooks/nostr/use-messages.ts` | 监听 Repository "update" 事件获取新消息 |

#### seq-counter 处理
- **暂时保留** `seq-counter.ts`。seq counter 是本地发送计数器，与 Repository（存储接收事件）正交
- Repository 提供更完整的消息集（IDB + relay），自然减少 gap

#### 新的消息获取流程
```
1. 启动 → IDB 加载已有消息到 Repository → 立即可显示
2. 订阅 relay → EOSE 信号标记历史拉取完成（非固定超时）
3. 新消息到达 → Repository "update" → React 重渲染
4. 关闭页面 → 已在 Repository 中的消息已持久化到 IDB
```

#### 测试
- storage.ts 单元测试 (fake-indexeddb)
- message-store.ts Repository 查询测试
- 集成测试：消息刷新后仍存在（从 IDB 加载）

---

### Phase 3: Thunk 发布 + 投递状态跟踪 (3-4 天)

**目标**: 用 welshman Thunk 系统实现 per-relay 发布跟踪、持久化投递状态、中止/重试。

#### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/welshman/publish.ts` | ~100 | 封装 welshman `publishThunk()`。返回 `ThunkHandle`：per-relay 状态、聚合状态、abort()、retry() |
| `hooks/nostr/use-publish-status.ts` | ~60 | React hook 订阅 Thunk 状态更新。返回 `{ statusByRelay, aggregateStatus, retry, abort }` |

#### DeliveryStatus 映射

```
welshman PublishStatus    →  dodo-box DeliveryStatus
─────────────────────────────────────────────────────
Sending                   →  'sending' (新增)
Pending                   →  'pending'
Success (任一 relay)      →  'sent'
Failure/Timeout (全部)    →  'failed'
Aborted                   →  'failed'
```

#### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/nostr/types.ts` | `DeliveryStatus` 新增 `'sending'`。新增 `DeliveryStatusDetail` 类型含 per-relay 信息 |
| `lib/nostr/real-adapter.ts` | `sendMessage()` 返回含 thunk 引用的结果 |
| `hooks/nostr/use-messages.ts` | 重写乐观更新 + 重试，基于 thunk 状态跟踪 |
| `app/(main)/messages/[id]/chat-view.tsx` | `SendStatusIcon` 处理新 `'sending'` 状态 |

#### 新的发送流程
```
1. 用户点发送 → 乐观更新 UI (status: 'sending')
2. 创建 kind-14 事件 → Nip59 gift wrap
3. publishThunk() 发布到多个 relay
4. Thunk 实时更新每个 relay 的状态
5. 任一 relay 成功 → status: 'sent' ✓
6. 全部失败 → status: 'failed' ✗ (可点击重试)
7. 刷新页面 → 从 IDB 恢复消息 + 状态
```

#### 测试
- publish.ts 单元测试 (mock welshman publish)
- use-publish-status hook 测试
- 集成测试：发送消息，验证状态流转
- E2E：发送消息，验证 checkmark 出现

---

### Phase 4: Router + Relay 质量评分 (2-3 天)

**目标**: 用 `@welshman/router` 实现智能 relay 选择和质量评分。

#### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/welshman/router-config.ts` | ~80 | 配置路由策略：DM 用收件人+发件人 relay，profile/follows 用作者 relay，fallback 到默认 relay |
| `lib/welshman/relay-quality.ts` | ~60 | 跟踪 relay 响应时间、错误率、在线率。评分存 localStorage |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/welshman/relay-manager.ts` | 用 router 选择 relay 而非广播全部 |
| `lib/welshman/publish.ts` | 用 router 为每个收件人选最优 relay |
| `lib/nostr/real-adapter.ts` | `getRelays()` / `setRelays()` 接入 router 配置 |

#### 路由策略
```
DM (kind 14/1059):
  → 收件人的 messaging relay + 发件人的 relay
  → fallback: 配置的默认 relay

Profile (kind 0):
  → 作者的已知 relay

Follows (kind 3):
  → 作者的 relay

Vault (kind 31990):
  → 用户配置的 relay（不变）
```

#### 测试
- router 配置单元测试
- 集成测试：消息发到正确的 relay 子集

---

### Phase 5: 清理 + 整合 (2-3 天)

**目标**: 删除被替换的代码，精简 adapter 为薄代理。

#### 删除文件

| 文件 | 行数 | 被什么替代 |
|------|------|-----------|
| `lib/nostr/relay-client.ts` | 190 | welshman/relay-manager.ts |
| `lib/nostr/events.ts` | 126 | welshman/crypto.ts + welshman 事件构建器 |
| `lib/nostr/contact-cache.ts` | 81 | Repository + localStorage 元数据 |

#### 可选删除

| 文件 | 行数 | 条件 |
|------|------|------|
| `lib/nostr/seq-counter.ts` | 73 | 如果改为从 Repository 派生 seq |

#### 保留不变的文件

| 文件 | 原因 |
|------|------|
| `lib/nostr/vault-crypto.ts` | 身份管理，与 welshman 无关 |
| `lib/nostr/vault-sync.ts` | Phase 1 已更新 import，逻辑不变 |
| `lib/nostr/key-derivation.ts` | 纯密码学，与 welshman 无关 |
| `lib/nostr/gap-detection.ts` | 操作 NostrMessage[] 数组，与数据来源无关 |
| `lib/nostr/types.ts` | 接口契约保留，Phase 3 有扩展 |
| `lib/nostr/empty-adapter.ts` | SSR/未认证状态仍需要 |
| `lib/nostr/index.ts` | 工厂模式保留 |

#### real-adapter.ts 最终状态
从 458 行瘦身到 ~150 行。每个方法委托 welshman 模块：
```
getMessages()          → message-store.ts 查询 Repository
sendMessage()          → publish.ts (Thunk)
subscribeToMessages()  → Repository "update" 监听
getContacts()          → Repository 查询 kind-3
getProfile()           → Repository 查询 kind-0
getRelays()            → router-config.ts
setRelays()            → router-config.ts
recoverMessages()      → relay-manager.ts 时间范围查询
```

#### 测试迁移
- 删除 `relay-client.test.ts`
- 重写 `events.test.ts` → 测试 welshman crypto 封装
- 更新 `real-adapter-*.test.ts` mock 为 welshman Repository
- 现有 E2E 测试应无需改动（INostrAdapter 接口不变）

---

## 工作量汇总

| Phase | 描述 | 天数 | 新增行 | 删除行 | 修改行 |
|-------|------|------|--------|--------|--------|
| 0 | 基础设施 + Svelte-React 桥接 | 2-3 | +240 | 0 | 0 |
| 1 | 替换 relay 层 + 事件签名 | 3-4 | +180 | -190 | ~100 |
| 2 | Repository + IndexedDB 存储 | 3-4 | +270 | 0 | ~150 |
| 3 | Thunk 发布 + 投递状态 | 3-4 | +160 | 0 | ~200 |
| 4 | Router + relay 质量 | 2-3 | +140 | 0 | ~60 |
| 5 | 清理 + 整合 | 2-3 | 0 | -400 | ~200 |
| **合计** | | **15-21** | **+990** | **-590** | **~710** |

净结果：减少 ~400 行自建代码，获得 IndexedDB 持久化、per-relay 发布跟踪、智能路由、EOSE 拉取。

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| welshman 依赖 Svelte store 模式 | `useSyncExternalStore` 桥接，welshman store 的 `{ subscribe, get }` 恰好兼容 |
| Next.js SSR 兼容性 | 所有 welshman 代码用 `typeof window !== 'undefined'` 守护；engine 懒初始化 |
| welshman 某些模块直接 import svelte | 用 dynamic import + tree-shaking，或在 next.config.ts 配置 alias |
| nostr-tools 版本冲突 | welshman 内部依赖 nostr-tools，应无冲突；逐步迁移直接引用 |
| IndexedDB 在 Capacitor (Android) | WebView 支持 IndexedDB，idb 库处理兼容性 |
| localStorage 旧数据迁移 | session/vault 数据不变；seq counter 可选迁移到 Repository 派生 |

---

## 消息可靠性：为什么移植后消息不会丢？

### 当前问题根因
```
发送: seq 先分配 → relay 可能失败 → seq 空洞 → gap 误报
接收: 5 秒超时 → 慢 relay 的消息丢失 → gap
持久化: 无 → 刷新重拉 → relay 可能已清理旧消息
```

### 移植后解决方案
```
发送:
  1. Thunk 跟踪每个 relay 的发布结果
  2. 至少 1 个 relay 成功才标记 'sent'
  3. 全部失败 → 'failed' + 可重试
  4. seq 可延迟到确认成功后分配（可选优化）

接收:
  1. IndexedDB 持久化 → 已有消息无需重拉
  2. EOSE 信号 → 不再靠固定超时
  3. Repository 聚合多 relay 结果 → 消息更完整

持久化:
  1. 消息存 IndexedDB → 刷新不丢
  2. Tracker 记录事件在哪些 relay 上 → 可精确补拉
  3. WrapManager 缓存解密映射 → 不重复解密
```

---

## 并行执行策略

Phase 内部可并行的工作（用 subagent）：

**Phase 0**:
- Agent A: 安装依赖 + 类型检查
- Agent B: 编写 store-adapter.ts + 测试
- Agent C: 编写 engine.ts + 测试

**Phase 1**:
- Agent A: relay-manager.ts + 测试
- Agent B: crypto.ts + 测试
- Agent C: 更新 import (real-adapter, vault-sync, NostrContext)

**Phase 2**:
- Agent A: storage.ts (IndexedDB) + 测试
- Agent B: message-store.ts + 测试
- Agent C: 更新 real-adapter.ts getMessages/subscribeToMessages

**Phase 3**:
- Agent A: publish.ts (Thunk 封装) + 测试
- Agent B: use-publish-status.ts hook + 测试
- Agent C: 更新 use-messages.ts + chat-view.tsx

**Phase 4-5**: 较小，可顺序执行
