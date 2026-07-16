# Mock Telegram Server 架构设计

## 一、角色定义

| 角色 | 说明 |
|------|------|
| **Hermes** | 外部 AI 消息网关程序。使用 `python-telegram-bot` 库，通过 Telegram Bot API 收发消息。 |
| **dodo-bot** | 我们的程序。扮演一个 mock Telegram server，对外伪装成 Telegram Bot API。同时拥有自己的 Nostr 公私钥身份。 |
| **dodo-client** | 真实的人类用户。dodo-box 前端，通过 Nostr 协议与 dodo-bot 通信。 |

## 二、完整链路

```
┌──────────────────────┐     Telegram Bot API HTTP      ┌──────────────────────┐
│       Hermes         │ ──────────────────────────────▶ │      dodo-bot       │
│                      │  POST /api/telegram/bot<token>/ │                     │
│  (python-telegram-   │       sendMessage / getUpdates  │  (Next.js API       │
│   bot)               │ ◀────────────────────────────── │   routes + Nostr)   │
│                      │                                  │                     │
│  config.yaml:        │                                  │  拥有 Nostr 身份     │
│    base_url: "..."   │                                  │  (npub/nsec)        │
└──────────────────────┘                                  └──────────┬───────────┘
                                                                     │
                                                          Nostr (NIP-17)
                                                          Gift Wrap 加密
                                                          (kind-1059)
                                                                     │
                                                                     ▼
                                                          ┌──────────────────┐
                                                          │   dodo-client    │
                                                          │   (真实用户)      │
                                                          │   dodo-box Web   │
                                                          └──────────────────┘
```

## 三、Hermes 如何连接 dodo-bot

### 3.1 Hermes 配置

```yaml
platforms:
  telegram:
    enabled: true
    token: "fake-bot-token-12345"  # 任意字符串，dodo-bot 验证即可
    extra:
      base_url: "http://dodo-bot:3000/api/telegram/"   # 指向我们的 API
      base_file_url: "http://dodo-bot:3000/api/telegram/"
    home_channel:
      platform: telegram
      chat_id: "1001"
      name: "dodo-client"
```

### 3.2 python-telegram-bot 的 URL 拼接规则

Hermes 使用 `Application.builder().token(token).base_url(base_url)` 构建客户端。
python-telegram-bot 库会自动将 token 拼接到 URL 中：

```
完整 URL = base_url + "bot" + token + "/" + methodName
```

例如：
- `base_url` = `http://localhost:3000/api/telegram/`
- `token` = `fake-bot-token-12345`
- `sendMessage` → `http://localhost:3000/api/telegram/botfake-bot-token-12345/sendMessage`

这就是我们 Next.js API route 的路径格式：`/api/telegram/bot[token]/sendMessage`。

## 四、Hermes 调用的 Telegram Bot API 端点（基于源码分析）

基于 `docs/harness-channel-dev/telegram.py` 的实际调用：

| 端点 | 方法 | 用途 | 关键参数 |
|------|------|------|----------|
| `getMe` | GET | 启动时验证 bot 身份 | 无 |
| `getUpdates` | GET | 长轮询拉取用户消息 | `offset`, `timeout`(30-50s), `allowed_updates` |
| `sendMessage` | POST | 发送文本消息 | `chat_id`, `text`, `parse_mode`("MarkdownV2/Markdown/None"), `reply_to_message_id`, `message_thread_id`, `link_preview_options` |
| `sendPhoto` | POST | 发送图片 | `chat_id`, `photo`, `caption`, `parse_mode` |
| `sendVideo` | POST | 发送视频 | `chat_id`, `video`, `caption` |
| `sendAudio` / `sendVoice` | POST | 发送音频 | `chat_id`, `audio/voice`, `caption` |
| `sendDocument` | POST | 发送文件 | `chat_id`, `document`, `caption` |
| `sendAnimation` | POST | 发送动图 | `chat_id`, `animation`, `caption` |
| `deleteWebhook` | POST | 启动时清除 webhook | 无 |
| `setMyCommands` | POST | 设置命令菜单 | `commands` |
| `sendChatAction` | POST | 发送打字指示器 | `chat_id`, `action` |
| `editMessageText` | POST | 编辑已发消息（流式输出） | `chat_id`, `message_id`, `text`, `parse_mode` |
| `getChat` | GET/POST | 获取聊天信息 | `chat_id` |
| `getChatMember` | GET/POST | 获取成员信息 | `chat_id`, `user_id` |
| `leaveChat` | POST | 离开群聊 | `chat_id` |

### 关键行为特征

1. **长轮询**: `getUpdates` 会 hold 连接 30-50 秒，有新消息才返回，超时返回空数组
2. **MarkdownV2**: `sendMessage` 的 text 使用 MarkdownV2 格式，我们需支持或回退纯文本
3. **消息截断**: 超过 4096 UTF-16 字符的消息会被拆分成多个 chunk，带 `(1/2)` 后缀
4. **流式输出**: Hermes 会通过 `editMessageText` 实时更新已发消息的内容
5. **回复线程**: `message_thread_id` 用于 DM Topics（论坛主题模式）

## 五、数据流向

### 5.1 下行：Hermes AI 响应 → dodo-client

```
1. Hermes AI 生成回复
2. Hermes 调用 POST {base_url}bot<token>/sendMessage
   参数: { chat_id: "1001", text: "AI回复内容", parse_mode: "MarkdownV2" }
3. dodo-bot API 收到请求，验证 token
4. dodo-bot 用自己的 Nostr 身份构建 kind-14 事件
5. 用 NIP-17 Gift Wrap (kind-1059) 加密，发送给 dodo-client 的 pubkey
6. 发布到 Nostr relay
7. dodo-client 订阅到 gift wrap，解密后显示消息
```

### 5.2 上行：dodo-client 用户消息 → Hermes

```
1. dodo-client 在 UI 中输入消息
2. dodo-client 用 Nostr 协议发送消息给 dodo-bot 的 pubkey
   (通过 NIP-17 Gift Wrap 加密)
3. dodo-bot 订阅到消息，解密得到用户消息内容
4. dodo-bot 将消息存入 pendingUpdates 队列
5. Hermes 的长轮询 getUpdates 请求被唤醒，返回该消息
6. Hermes 处理消息，调用 AI，然后走下行流程
```

## 六、dodo-bot 的 Nostr 身份

dodo-bot 需要：
- 一对 Nostr 公私钥（npub/nsec）
- 这个 pubkey 作为 dodo-client 的"联系人"
- dodo-client 添加 dodo-bot 为联系人后，才能与其通信
- dodo-bot 的 pubkey 需要在 dodo-box 中可配置

### 身份映射

| Telegram 概念 | Nostr 概念 |
|---------------|-----------|
| Telegram User ID (如 1001) | dodo-client 的联系人 pubkey |
| Telegram Bot (dodo-bot) | dodo-bot 自己的 Nostr pubkey |
| chat_id | dodo-client 联系人的 pubkey |
| bot token | 验证密钥（任意字符串） |

## 七、dodo-bot 需要实现的 API

### 7.1 核心端点（必须）

| 端点 | 说明 | 处理逻辑 |
|------|------|----------|
| `POST /bot<token>/sendMessage` | Hermes 发消息过来 | 验证 token → Nostr Gift Wrap → 发布到 relay → 返回 mock message_id |
| `POST /bot<token>/getUpdates` | Hermes 拉取用户回复 | 长轮询等待 → 检查 dodo-client 是否有新消息 → 返回 Telegram Update 格式 |
| `GET /bot<token>/getMe` | 启动验证 | 返回 mock bot 信息 |

### 7.2 辅助端点（建议支持）

| 端点 | 说明 | 处理逻辑 |
|------|------|----------|
| `POST /bot<token>/editMessageText` | 流式输出更新 | 更新 Nostr 消息内容（或忽略，dodo-box 不支持编辑） |
| `POST /bot<token>/sendChatAction` | 打字指示器 | 忽略或转发为 Nostr 事件 |
| `POST /bot<token>/deleteWebhook` | 启动清除 | 返回 ok |
| `POST /bot<token>/setMyCommands` | 命令菜单 | 返回 ok |
| `POST /bot<token>/sendPhoto` | 图片 | 存入 pendingUpdates 供 Hermes 接收 |
| `POST /bot<token>/sendDocument` | 文件 | 存入 pendingUpdates |

### 7.3 自定义端点（管理用途）

| 端点 | 说明 |
|------|------|
| `GET /api/mock-telegram/bot-info` | 获取当前 bot token 和 Nostr pubkey |
| `POST /api/mock-telegram/regenerate-token` | 重新生成 bot token |
| `GET /api/mock-telegram/contacts` | 获取联系人列表 |
| `POST /api/mock-telegram/contacts` | 添加联系人 |

## 八、配置方式

dodo-bot 需要可配置以下参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `botToken` | Telegram Bot Token（假 token） | 启动时自动生成随机字符串 |
| `botUsername` | bot 用户名 | `dodobox_bot` |
| `botFirstName` | bot 显示名称 | `DodoBox Bot` |
| `dodoBotNostrPrivkey` | dodo-bot 的 Nostr 私钥 | 自动生成 |
| `dodoBotNostrPubkey` | dodo-bot 的 Nostr 公钥 | 从私钥派生 |
| `relayUrls` | Nostr 中继地址 | 同 dodo-box 配置 |

## 九、实现方式

dodo-bot 的 mock Telegram API 跑在 Next.js 的 `app/api/telegram/` 路由中。

```
dodo-box (Next.js)
  ├── app/api/telegram/[token]/route.ts  ← Telegram Bot API 兼容层
  ├── app/api/mock-telegram/             ← 管理端点
  ├── lib/mock-telegram-server.ts        ← 服务端核心逻辑
  │   ├── token 验证
  │   ├── Update 队列管理
  │   ├── 长轮询管理
  │   └── Nostr 消息收发
  └── lib/nostr/mock-telegram-adapter.ts ← 客户端 adapter
      └── 前端 ↔ dodo-bot 的 Nostr 通信
```

## 十、当前实现的问题

之前我实现的 mock 是**自循环**的——dodo-client 发消息给 mock server，
mock server 自动回复。这不是你想要的。

你要的是**三方通信**：
- Hermes ↔ dodo-bot ↔ dodo-client
- dodo-bot 是中间桥梁
- dodo-bot 一端用 mock Telegram API 与 Hermes 对话
- dodo-bot 一端用 Nostr 协议与 dodo-client 对话
