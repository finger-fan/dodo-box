# 计划：联系人系统统一到 lib 层（relay 存储）

## Context

当前联系人系统存在两套不互通的实现：
- **UI**（`lib/nostr/real-adapter.ts`）：relay 存储（kind:3 NIP-02），跨设备同步
- **CLI**（`lib/messaging/contacts.ts`）：本地文件存储（`~/.dodobox/contacts.json`），仅本机

目标：让 CLI 的联系人也走 relay 存储，与 UI 共享同一份好友列表。同时在 CLI 添加 `select` 命令，选定联系人后后续所有文字输入都发给该联系人，无需重复 select。

## 步骤

### 1. 重构 `lib/messaging/contacts.ts` — 改为 relay 存储

**改什么**：把本地文件 I/O 替换为 kind:3 publish/fetch。

**新增/修改的函数**：

| 函数 | 说明 |
|------|------|
| `fetchContacts(myPubkey, relayUrls)` | 从 relay 拉取 kind:3，解析 tags 返回 `CliContact[]` |
| `publishContacts(contacts, myPrivkey, relayUrls)` | 构建 kind:3 event 并发布到 relay |
| `addContact(contacts, pubkey, name?)` | 纯内存操作：往数组里加一个联系人 |
| `removeContact(contacts, pubkey)` | 纯内存操作：从数组里移除 |

**关键复用**：
- `buildFollowListEvent()` from `lib/welshman/crypto.ts` — 构建 kind:3 event
- `publishEvent()` / `fetchEvents()` from `lib/messaging/relay-node.ts` — relay 通信
- `decodeNpub()` — 保留（npub 解码）

**删除**：
- `loadContacts()` / `saveContacts()` — 不再读写本地文件

**数据结构**（保持和 UI 一致的 kind:3 tag 格式）：
```
tag: ['p', pubkey, '', petname]
```

### 2. 修改 `cli/main.ts` — 启动时 fetch + 命令适配

**启动流程变更**：
```
注册/登录 → 连接 relay → fetchContacts() 拉取联系人列表 → 进入交互循环
```

**命令变更**：
- `/contacts` — 显示内存中的联系人列表（已含昵称和 pubkey）
- `/add <pubkey|npub> [name]` — 内存中添加 → 立即 publish 到 relay
- `/remove <pubkey>` — 内存中移除 → 立即 publish 到 relay
- `/sync` — 手动从 relay 重新拉取联系人（可选）
- **新增 `/select <pubkey|name>`** — 设置当前联系人

### 3. 实现 `select` 命令

**行为**：
```
> /select bob
  ✅ Now chatting with bob (2672014b...)

> 你好！
  ✅ Sent to bob: "你好！"

> 去哪儿了？
  ✅ Sent to bob: "去哪儿了？"

> /select alice
  ✅ Now chatting with alice (786ee6d1...)

> 嘿
  ✅ Sent to alice: "嘿"
```

**逻辑**：
- 维护一个 `selectedContact: string | null` 变量
- 用户输入文字时，如果 `selectedContact` 不为 null，直接发送给该联系人
- `/select` 不带参数 → 显示当前选中的联系人
- `/unselect` 或 `/clear` → 取消选中
- 匹配规则：先按 pubkey 精确匹配，再按 name 模糊匹配

**关键点**：select 是一次性操作，选定后所有文字输入都发给该联系人，直到下次 `/select` 切换或 `/unselect`。

### 4. 发送逻辑适配

当前 `cli/main.ts` 发消息流程：输入 pubkey → 输入消息 → 发送。

`select` 后的新流程：
- 输入纯文字 → 直接发给 selectedContact
- 输入 64 位 hex pubkey → 仍走"先 pubkey 再消息"流程（向后兼容）
- 输入 `/select` → 切换联系人
- 输入其他命令 → 正常处理

## 不改的东西

- `lib/nostr/real-adapter.ts`（UI 联系人逻辑）— 不动，保持 UI 可用
- `lib/welshman/crypto.ts` — 复用 `buildFollowListEvent()`，不改
- `lib/messaging/receiver.ts` — 消息接收逻辑不变

## 涉及文件

| 文件 | 操作 |
|------|------|
| `lib/messaging/contacts.ts` | 重写 — 本地文件 → relay 存储 |
| `cli/main.ts` | 修改 — 启动 fetch、命令适配、select 命令 |
| `docs/cli-first-summary.md` | 更新 — 记录变更 |

## 验证

1. 启动 CLI A 和 CLI B，分别注册 alice 和 bob
2. A 执行 `/add <B的pubkey> bob` → 确认 publish 到 relay 成功
3. A 执行 `/contacts` → 显示 bob 在列表中
4. A 执行 `/select bob` → 显示 "Now chatting with bob"
5. A 输入 "你好！" → 直接发给 bob，无需再输入 pubkey
6. A 输入 "去哪儿了？" → 继续发给 bob
7. B 确认收到两条消息："你好！" 和 "去哪儿了？"
8. （可选）启动 UI → 用 alice 账户登录 → 联系人列表应包含 bob（证明 kind:3 互通）

---

## 实施记录（2026-07-12）

### 已完成的变更

#### 1. `lib/messaging/contacts.ts` — 重构为 relay 存储

**删除的功能**：
- `loadContacts()` / `saveContacts()` — 本地文件 I/O 移除

**新增的功能**：
- `fetchContacts(myPubkey, relayUrls)` — 从 relay 拉取 kind:3 事件
- `publishContacts(contacts, myPrivkey, relayUrls)` — 发布 kind:3 事件到 relay

**保留的功能**：
- `addContact()` — 纯内存操作（不再写文件）
- `removeContact()` — 纯内存操作（不再写文件）
- `listContacts()` — 显示联系人列表
- `findContact()` — 按 pubkey 或 name 查找联系人
- `fetchRecentMessages()` — 从 relay 获取历史消息

#### 2. `cli/main.ts` — 命令适配

**启动流程**：
```typescript
// 连接 relay 后立即从 relay 拉取联系人
let contacts = await fetchContacts(session.masterPubkey, relays)
let selectedContact: CliContact | null = null
```

**新增命令**：
- `/select <name|pubkey>` — 选择联系人，后续直接输入文字发送
- `/unselect` — 取消选择
- `/add` 和 `/remove` 后自动调用 `publishContacts()` 同步到 relay

**发送逻辑**：
```typescript
// 如果已选择联系人，直接发送文字
if (selectedContact && !input.startsWith('/')) {
  await sendDirectMessage(input, selectedContact.pubkey, ...)
}
```

### 未变更的功能

- `/history <pubkey>` — 保持从 relay 读取历史消息（未做本地存储）
- `/contacts`、`/list`、`/profile`、`/quality`、`/status` — 功能不变

### 技术要点

1. **kind:3 事件格式**：
   ```
   tags: [['p', pubkey, '', petname], ...]
   ```
   与 UI 的 `buildFollowListEvent()` 保持一致

2. **内存管理**：
   - 联系人列表在启动时从 relay 加载到内存
   - 添加/删除后发布到 relay，但不写本地文件
   - 重启后需要重新从 relay 拉取

3. **错误处理**：
   - relay 连接失败时，联系人列表为空
   - publish 失败时打印警告，但不阻断操作
