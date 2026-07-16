# Mock Telegram Server 知识沉淀

> 日期: 2026-04-28 ~ 2026-04-29
> 目标: 为 dodo-box 项目增加 mock Telegram server，使外部 Hermes AI 网关能够通过 Telegram Bot API 与 dodo-client 通信

---

## 一、原始需求

用户希望评估在当前 dodo-box 项目中增加一个 mock Telegram 服务的可行性。背景：

- 有一个外部程序叫 **Hermes**（AI 消息网关），它需要通过 Telegram Bot API 收发消息
- 我们想让 Hermes 连接到我们的程序，而不是真实的 Telegram 服务器
- `docs/harness-channel-dev/` 目录提供了 Hermes 的 Telegram 适配器参考源码

**三方角色：**

| 角色 | 说明 |
|------|------|
| **Hermes** | 外部 AI 消息网关，使用 `python-telegram-bot` 库 |
| **dodo-bot** | 我们的程序，伪装成 Telegram Bot API，同时拥有 Nostr 身份 |
| **dodo-client** | 真实用户，dodo-box 前端，通过 Nostr 与 dodo-bot 通信 |

**数据流：Hermes ↔ dodo-bot ↔ dodo-client**

---

## 二、第一轮实现（错误）

### 2.1 做了什么

我创建了一个**独立的 Docker 服务**，目录 `mock-telegram/`：
- `Dockerfile`、`package.json`、`src/server.js`、`src/store.js`、`src/long-poll.js`、`src/auto-reply.js`、`src/seed-data.js`
- 一个 Express.js 服务，端口 18340
- `lib/nostr/mock-telegram-adapter.ts` 调用 `http://localhost:18340`

修改了：
- `lib/nostr/index.ts` — 新增 `AdapterMode` 和 factory 路由
- `contexts/NostrContext.tsx` — mock 模式自动登录
- `docker-compose.yml` — 新增 `mock-telegram` 服务
- `app/(main)/settings/page.tsx` — 连接模式切换开关
- `.env.example` — 新增环境变量

### 2.2 用户指出的问题

**问题 1：为什么是独立目录？**
> "你是用纯 JS 写的。那我是客户端链接，我是要用我这个项目 dodo box。你为什么要建立在一个独立的目录下，而不是在我的程序下面去建立一套 API。我的程序本身就是 nextjs 的，是有服务端的。"

**错误原因**：Next.js 本身有 API routes（`app/api/`），不需要额外 Docker 容器。我把简单的事情搞复杂了。

**问题 2：环境变量过度设计**
> "还有这些环境变量在哪儿配置啊？是 nextjs 的配置文件吗？"
> "你在给我瞎编吧。"

**错误原因**：我自行添加了 `MOCK_BOT_USERNAME`、`MOCK_BOT_FIRST_NAME` 等可配置环境变量，用户根本没要求配置化。token、bot 名完全可以写死。

**问题 3：数据结构对不上**
> "telegram 里面要 mark 一个 telegram 的话，你的数据根本就对不上号啊"

**错误原因**：我实现了一个自循环 mock——dodo-client 发消息给 mock server，mock server 自动回复。这不是用户要的三方通信。

---

## 三、第二轮实现（修正架构）

### 3.1 架构修正

**核心决策**：删除独立 Docker 服务，改用 Next.js API routes。

**删除的内容**：
- `mock-telegram/` 整个目录
- `docker-compose.yml` 中的 `mock-telegram` 服务
- `NEXT_PUBLIC_MOCK_TELEGRAM_URL` 环境变量

**新增的内容**：

```
dodo-box (Next.js)
  ├── app/api/telegram/[token]/route.ts       ← Telegram Bot API 兼容层
  ├── app/api/telegram/contacts/route.ts       ← 自定义联系人列表接口
  ├── lib/mock-telegram-server.ts              ← 服务端共享 store
  └── lib/nostr/mock-telegram-adapter.ts       ← 客户端 adapter（重写）
```

### 3.2 URL 路径规则

Hermes 使用 `python-telegram-bot` 库，通过 `Application.builder().token(token).base_url(base_url)` 构建。

python-telegram-bot 的 URL 拼接规则：
```
完整 URL = base_url + "bot" + token + "/" + methodName
```

所以我们的 Next.js API route 必须是：
```
/api/telegram/bot[token]/sendMessage
/api/telegram/bot[token]/getUpdates
```

对应 Next.js 的 `[token]` 动态路由：`app/api/telegram/[token]/route.ts`。

---

## 四、基于 harness-channel-dev 源码的深度分析

用户要求参考 `docs/harness-channel-dev/` 目录中的真实代码来修正架构文档。

### 4.1 Hermes 配置方式

Hermes 的 `config.yaml`：
```yaml
platforms:
  telegram:
    enabled: true
    token: "fake-bot-token-12345"   # 任意字符串，dodo-bot 验证即可
    extra:
      base_url: "http://dodo-bot:3000/api/telegram/"
      base_file_url: "http://dodo-bot:3000/api/telegram/"
    home_channel:
      platform: telegram
      chat_id: "1001"
      name: "dodo-client"
```

### 4.2 Hermes 实际调用的 Telegram Bot API 端点

从 `telegram.py` 源码分析得出：

| 端点 | 方法 | 调用场景 |
|------|------|----------|
| `getMe` | GET | 启动时验证 bot 身份 |
| `getUpdates` | GET | 长轮询拉取用户消息（hold 30-50 秒） |
| `sendMessage` | POST | 发送 AI 回复文本 |
| `sendPhoto` | POST | 发送图片 |
| `sendVideo` | POST | 发送视频 |
| `sendAudio` / `sendVoice` | POST | 发送音频 |
| `sendDocument` | POST | 发送文件 |
| `sendAnimation` | POST | 发送动图 |
| `sendChatAction` | POST | 发送打字指示器 |
| `editMessageText` | POST | 流式输出——实时更新已发消息 |
| `deleteWebhook` | POST | 启动时清除 webhook |
| `setMyCommands` | POST | 设置命令菜单 |
| `getChat` | GET/POST | 获取聊天信息 |
| `getChatMember` | GET/POST | 获取成员信息 |
| `leaveChat` | POST | 离开群聊 |

### 4.3 关键行为特征

**长轮询**：`getUpdates` 会 hold 连接 30-50 秒，有新消息才返回，超时返回空数组。这意味着我们的 mock server 必须实现真正的等待逻辑，不能立即返回。

**MarkdownV2**：`sendMessage` 的 text 使用 MarkdownV2 格式。Hermes 的 `telegram.py` 源码显示：
- 先用 `_escape_mdv2()` 转义特殊字符
- 用 `format_message()` 转换格式
- 如果 MarkdownV2 解析失败，回退到纯文本

我们需要 mock server 接受 MarkdownV2 格式的文本，但 dodo-client 端显示时可以剥离格式标记。

**消息截断**：超过 4096 UTF-16 字符的消息会被拆分成多个 chunk，带 `(1/2)` 后缀。`truncate_message()` 方法使用 UTF-16 长度计数（不是字符数）。

**流式输出**：Hermes 会通过 `editMessageText` 实时更新已发消息的内容（AI 逐字输出效果）。dodo-box 前端可能不支持编辑，所以这个端点可以先返回 mock ok。

**DM Topics**：`message_thread_id` 用于论坛主题模式。我们的 mock 可以先忽略线程，只处理私聊。

### 4.4 python-telegram-bot 的 send 调用参数

```python
msg = await self._bot.send_message(
    chat_id=int(chat_id),
    text=chunk,
    parse_mode=ParseMode.MARKDOWN_V2,  # 或 None（纯文本）
    reply_to_message_id=reply_to_id,
    message_thread_id=effective_thread_id,
    link_preview_options=...,
)
```

这意味着我们的 `sendMessage` 端点收到的 JSON body 包含：
- `chat_id`（整数）
- `text`（MarkdownV2 或纯文本）
- `parse_mode`（字符串，可选）
- `reply_to_message_id`（整数，可选）
- `message_thread_id`（整数，可选）

---

## 五、dodo-bot 的 Nostr 身份设计

dodo-bot 不是无身份的。它需要：
- 一对 Nostr 公私钥（npub/nsec）
- 这个 pubkey 作为 dodo-client 的"联系人"
- dodo-client 添加 dodo-bot 为联系人后，才能与其通信
- 下行消息：dodo-bot 用自己的 Nostr 身份构建 kind-14 事件，用 NIP-17 Gift Wrap (kind-1059) 加密后发布到 relay
- 上行消息：dodo-bot 订阅到 dodo-client 的 Gift Wrap，解密后存入 pendingUpdates 队列供 Hermes 拉取

### 概念映射

| Telegram 概念 | Nostr 概念 |
|---------------|-----------|
| Telegram User ID (如 1001) | dodo-client 的联系人 pubkey |
| Telegram Bot (dodo-bot) | dodo-bot 自己的 Nostr pubkey |
| chat_id | dodo-client 联系人的 pubkey |
| bot token | 验证密钥（任意字符串） |

---

## 六、当前代码状态

### 6.1 已创建的文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `app/api/telegram/[token]/route.ts` | ⚠️ 需要重写 | 当前实现是基于旧架构的，需要适配 Nostr 转发逻辑 |
| `app/api/telegram/contacts/route.ts` | ⚠️ 需要重写 | 当前只是简单的联系人列表，需要与 Nostr 整合 |
| `lib/mock-telegram-server.ts` | ⚠️ 需要重写 | 当前是自循环 store，需要改为 Nostr 转发 |
| `lib/nostr/mock-telegram-adapter.ts` | ⚠️ 需要重写 | 当前调用本地 API，需要改为 Nostr 协议 |
| `docs/mock-telegram-architecture.md` | ✅ 正确 | 基于 harness-channel-dev 源码分析的架构文档 |

### 6.2 已修改的文件

| 文件 | 修改内容 |
|------|----------|
| `lib/nostr/index.ts` | 新增 `AdapterMode`、`getAdapterMode()`、`setAdapterMode()` |
| `contexts/NostrContext.tsx` | 新增 mock 模式自动登录、`setAdapterMode` 方法 |
| `docker-compose.yml` | 删除 mock-telegram 服务，app 保留 `NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN` |
| `.env.example` | 更新环境变量说明 |
| `app/(main)/settings/page.tsx` | 新增 Connection Mode 切换开关 |

### 6.3 删除的内容

| 内容 | 原因 |
|------|------|
| `mock-telegram/` 整个目录 | 不需要独立 Docker 服务 |
| `docker-compose.yml` 中的 mock-telegram service | 同上 |
| `NEXT_PUBLIC_MOCK_TELEGRAM_URL` 环境变量 | 不需要指向外部服务 |

---

## 七、踩过的坑

### 7.1 React lint 规则：不能在 render 中访问 ref

`react-hooks/refs` 规则禁止在 JSX 中读取 `ref.current`。
**解决**：改用 `useState` 替代 `useRef`。

### 7.2 React lint 规则：不能在 useEffect 中同步调用 setState

`react-hooks/set-state-in-effect` 规则禁止在 effect 中直接 setState。
**解决**：把初始化逻辑移到 `useState` 的初始化函数中。

### 7.3 TypeScript NostrResult 类型

`NostrResult` 要求 `{ success: true, data: void }` 而不是 `{ success: true }`。
**解决**：返回 `{ success: true, data: undefined }`。

### 7.4 NostrProfile 没有 avatar 字段

`NostrProfile` 类型只有 `pubkey, name, displayName, picture, about, nip05`。
**解决**：移除 mock 返回中的 `avatar` 字段。

---

## 八、下一步需要做的事

### 8.1 重写 mock-telegram-server.ts

需要实现的核心逻辑：
1. 初始化时生成/加载 dodo-bot 的 Nostr 公私钥
2. `sendMessage` 端点：验证 token → 用 dodo-bot 的 Nostr 身份构建 kind-14 事件 → Gift Wrap 加密 → 发布到 relay
3. `getUpdates` 端点：长轮询等待 → 检查 dodo-client 发来的 Nostr 消息 → 转换为 Telegram Update 格式返回
4. Update 队列管理：支持 offset、limit、timeout 参数
5. 支持 `editMessageText`（可先返回 mock ok）
6. 支持 `sendPhoto`、`sendDocument` 等媒体端点

### 8.2 重写 mock-telegram-adapter.ts

当前 adapter 是前端调用本地 API 获取 mock 数据。需要改为：
1. 前端通过 Nostr 协议与 dodo-bot 通信
2. 前端显示 dodo-bot 为一个联系人
3. 用户给 dodo-bot 发消息 → Nostr Gift Wrap → dodo-bot 收到 → 存入 Update 队列 → Hermes getUpdates 拉取
4. Hermes sendMessage → dodo-bot 收到 → Nostr Gift Wrap → 前端收到消息

### 8.3 需要确认的问题

- dodo-bot 的 Nostr 私钥是自动生成还是可配置？
- 联系人列表从何而来？是 Hermes 的 `home_channel` 定义的吗？
- 是否需要支持多联系人（多个 Hermes 实例）？
- dodo-box 前端如何添加 dodo-bot 为联系人？

---

## 九、关键文件索引

| 文件 | 用途 |
|------|------|
| `docs/mock-telegram-architecture.md` | 架构设计文档（基于 harness-channel-dev 源码） |
| `docs/harness-channel-dev/SKILL.md` | Hermes Channel Integration Guide |
| `docs/harness-channel-dev/telegram.py` | Hermes 的 Telegram 适配器源码 |
| `docs/harness-channel-dev/base.py` | Hermes 的 BasePlatformAdapter 基类 |
| `docs/harness-channel-dev/config.py` | Hermes 配置管理 |
| `docs/harness-channel-dev/run.py` | Hermes 网关生命周期 |
| `lib/nostr/types.ts` | INostrAdapter 接口定义 |
| `lib/nostr/index.ts` | Adapter factory（含 AdapterMode） |
| `contexts/NostrContext.tsx` | Nostr 上下文（含 mock 模式支持） |
| `app/(main)/settings/page.tsx` | 设置页（含 Connection Mode 切换） |
