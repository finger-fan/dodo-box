# 私聊消息增强方案

> 基于 Coracle 项目分析与当前 dodo-box 实现对比

## 一、Coracle 私聊实现分析

### 1.1 核心特性

| 特性 | Coracle 实现 | dodo-box 当前实现 |
|------|--------------|------------------|
| 消息协议 | NIP-17 (kind 40) + 兼容 NIP-04 (kind 4) | NIP-17 Gift Wrap (kind 1059 包装 kind 14) |
| 加密方式 | NIP-44 加密 | NIP-44 加密 |
| 联系人来源 | 基于 follows 列表 | 基于 follows 列表 |
| 离线消息 | 支持 (通过 relay) | 部分支持 (recoverMessages) |
| 消息状态 | 显示发送状态/pending | 显示 sendStatus |
| 加密指示 | 图标显示 (lock/unlock) | 无 |

### 1.2 Coracle 关键代码结构

```typescript
// 消息派生状态 (state.ts)
export const messages = deriveEvents({
  repository,
  filters: [{kinds: [4, DIRECT_MESSAGE]}]  // 支持 kind 4 和 kind 40
})

// 发送消息 (commands.ts)
export const sendMessage = (channelId: string, content: string, delay: number) => {
  const recipients = uniq(channelId.split(",").concat(pubkey.get()))
  return sendWrapped({
    recipients,
    event: makeEvent(DIRECT_MESSAGE, {
      content,
      tags: [...remove(pubkey.get(), recipients).map(tagPubkey)],
    }),
  })
}
```

### 1.3 Chat 启用引导

Coracle 有一个专门的 `ChatEnable.svelte` 页面，引导用户启用私聊功能：

```svelte
// 用户首次使用时的引导
const enableChat = async () => {
  shouldUnwrap.set(true)
  loadMessages()
}
```

### 1.4 消息加密状态指示

Coracle 在消息气泡旁显示加密类型图标：

- **kind 4**: 显示 `fa-unlock` 图标，提示旧版 DM 缺点
- **kind 40/其他**: 显示 `fa-lock` 图标，提示新版 NIP-17

---

## 二、当前 dodo-box 实现分析

### 2.1 已有能力

- ✅ NIP-17 Gift Wrap (kind 1059) 加密消息
- ✅ NIP-44 加密 (通过 nostr-tools)
- ✅ 消息发送/接收
- ✅ 实时订阅新消息
- ✅ 联系人管理 (kind 3 follows)
- ✅ Seq 计数器排序
- ✅ 消息缓存 (contact-cache)
- ✅ 消息恢复 (recoverMessages)

### 2.2 待增强功能

| 优先级 | 功能 | 描述 |
|--------|------|------|
| P0 | 消息加密状态指示 | 显示 lock/unlock 图标 |
| P1 | NIP-04 兼容 | 接收旧版 kind 4 消息 |
| P1 | 首次私聊引导 | ChatEnable 页面 |
| P2 | 消息已读回执 | 标记已读状态 |
| P2 | 消息发送状态 | pending/sent/failed 动画 |
| P3 | 离线推送 | NIP-47 或 Web Push |

---

## 三、增强方案

### 3.1 消息加密状态指示 (P0)

**目标**: 在消息气泡旁显示加密类型图标

**修改文件**:
- `app/(main)/messages/[id]/chat-view.tsx`

```typescript
// 在消息组件中添加
const getEncryptionIcon = (msg: NostrMessage) => {
  // 当前 dodo-box 只发送 kind 14 (KIND_DIRECT_MESSAGE)
  // Gift Wrap 解密后可判断原始 kind
  if (msg.kind === 4) {
    return { icon: 'unlock', tooltip: 'Legacy NIP-04 DM' }
  }
  return { icon: 'lock', tooltip: 'NIP-17 Encrypted' }
}
```

### 3.2 NIP-04 兼容接收 (P1)

**目标**: 能够接收和解密旧版 kind 4 加密消息

**修改文件**:
- `lib/nostr/events.ts` - 添加 kind 4 解密函数
- `lib/nostr/real-adapter.ts` - 扩展消息过滤器

```typescript
// events.ts - 添加 NIP-04 解密
import { nip04 } from 'nostr-tools'

export function decryptNip04(
  content: string,
  senderPubkey: string,
  recipientPrivkeyHex: string
): string | null {
  try {
    return nip04.decrypt(senderPubkey, recipientPrivkeyHex, content)
  } catch {
    return null
  }
}

// real-adapter.ts - getMessages 扩展过滤
const filters: NostrFilter[] = [
  { kinds: [KIND_DM_WRAP, 4], '#p': [this.session.currentPubkey] },
]
```

### 3.3 首次私聊引导 (P1)

**目标**: 首次进入消息页面时引导用户了解私聊机制

**修改文件**:
- `app/(main)/messages/page.tsx` - 添加引导提示

```typescript
// 检测是否为首次使用私聊
const showChatGuide = useLocalStorage('dodobox_chat_guide_shown', false)

if (!showChatGuide) {
  // 显示引导模态框
  return <ChatEnableGuide onComplete={() => setShowChatGuide(true)} />
}
```

### 3.4 消息已读回执 (P2)

**目标**: 显示消息已读状态

**实现方式**: 使用 NIP-18 扩展或自定义标签

```typescript
// NostrMessage 接口扩展
interface NostrMessage {
  // ... existing fields
  readAt?: Date        // 已读时间
  deliveredAt?: Date   // 送达时间
}

// 发送已读回执
function sendReadReceipt(chatId: string, messageId: string) {
  // 发送 kind 7000+ 范围内的回执事件
}
```

### 3.5 消息发送状态动画 (P2)

**目标**: 发送中显示旋转图标，失败显示重试按钮

**修改文件**:
- `components/chat/MessageBubble.tsx`

```typescript
// 消息发送状态
const SendStatusIndicator = ({ status }: { status: DeliveryStatus }) => {
  switch (status) {
    case 'pending':
      return <i className="fa fa-circle-notch fa-spin text-gray-400" />
    case 'sent':
      return <i className="fa fa-check text-green-500" />
    case 'failed':
      return <button className="text-red-500 hover:text-red-700">
        <i className="fa fa-exclamation-circle" />
      </button>
  }
}
```

---

## 四、实施路线图

### Phase 1: 加密状态指示 (1天)
1. 在消息组件添加加密图标
2. 添加工具提示解释 NIP-17

### Phase 2: NIP-04 兼容 (2天)
1. 添加 nip04 解密函数
2. 扩展消息过滤器
3. 测试旧消息接收

### Phase 3: 首次引导 (1天)
1. 创建引导组件
2. 集成到消息页面
3. 添加 localStorage 状态

### Phase 4: 消息状态 (2天)
1. 发送状态动画
2. 已读回执 (可选)

---

## 五、相关文件清单

| 文件 | 修改类型 |
|------|----------|
| `lib/nostr/events.ts` | 新增 |
| `lib/nostr/real-adapter.ts` | 扩展 |
| `app/(main)/messages/[id]/chat-view.tsx` | 增强 |
| `components/ui/MessageBubble.tsx` | 新增/修改 |
| `app/(main)/messages/page.tsx` | 新增引导 |

---

## 六、参考资源

- [NIP-17: Private Direct Messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-04: Encrypted Direct Messages](https://github.com/nostr-protocol/nips/blob/master/04.md)
- [NIP-44: V2加密](https://github.com/nostr-protocol/nips/blob/master/44.md)
