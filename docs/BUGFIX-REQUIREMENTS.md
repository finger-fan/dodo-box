# 消息/聊天 Bug 修复需求单

> 基于 2026-07-25 测试反馈整理，共 **8 项**待确认/修复。请在开发前逐项校验理解是否正确。

---

## 1. 消息排序 / 跨天日期错乱

**问题描述**：聊天详情页的消息排序疑似未按日期正确分组，导致隔天消息混在一起或顺序错乱。当前页面始终显示“今天”作为日期分隔线，即使消息实际跨多天。

**当前行为**
- `chat-view.tsx` 中硬编码了 `{t('chat.today')}` 的日期分隔条，对所有消息生效。
- 排序逻辑 `sortMessages` 按时间戳毫秒数升序排列，虽然包含日期，但缺少按日期分组展示。
- 受 NIP-59 gift wrap 的 `created_at` 随机化（最多回溯 28 小时）影响，时间戳可能不准确，进一步加剧跨天错乱。

**期望行为**
- 消息按日期分组，每天显示正确的日期分隔条（如“今天”“昨天”“2026-07-24”等）。
- 跨天消息不再混在一起，日期分隔条能反映消息的真实日期。
- 考虑是否需要 gift wrap 时间戳修正或按 seq/逻辑顺序兜底。

**影响文件**
- `app/(main)/chat/chat-view.tsx`
- `hooks/nostr/use-messages.ts`
- `lib/nostr/real-adapter.ts`（时间戳/seq 相关）
- `public/locales/{zh,en}.json`（新增日期文案）

---

## 2. 遮罩文本行高 / 换行位置不一致

**问题描述**：消息启用“阅后遮罩”后，遮罩字符与原文字符宽度不同（韩文较稳定，中文/英文/其他文字差异明显），导致自动换行（wrap）的断点与原文不一致，渲染后气泡高度或行数发生变化。

**当前行为**
- `MaskedText` 直接使用 `whitespace-pre-wrap break-words` 渲染原文或遮罩文本。
- `maskText()` 按字符随机替换，仅保留空白字符；不同字符集宽度差异导致 CSS 换行断点变化。

**期望行为**
- 遮罩后的文本在固定宽度内占据与原文相同的行高和断点位置。
- 调研是否可以在渲染后获取每一行的 break 位置，并将相同断点应用到遮罩文本。
- 或采用等宽/固定字宽的渲染策略，确保原文与遮罩的 wrap 结果一致。

**影响文件**
- `components/chat/MaskedText.tsx`
- `lib/message-mask.ts`
- `app/(main)/chat/chat-view.tsx`（气泡样式）

---

## 3. 发送消息时应先渲染、先滚动

**问题描述**：用户点击发送后，感觉消息要等到发送成功才会出现，界面随后才自动上滑，产生迟钝感。

**当前行为**
- `useMessages` 已经实现了乐观更新（optimistic message），但 `processQueue` 中先设置 `isSending = true`，再创建乐观消息。
- 自动滚动依赖 `chatItems` 变化触发，理论上应立即生效；但在实际测试中用户仍感知到延迟。

**期望行为**
- 用户点击“发送”后，消息气泡应立即出现在聊天区域底部，并同步自动上滑，无需等待网络确认。
- 网络请求的 pending / sent / failed 状态仅在发送状态图标或轻量指示器中体现，不应阻塞消息的初次渲染与滚动。
- 即使发送失败，失败消息也已经在列表中，可点击重试。

**影响文件**
- `hooks/nostr/use-messages.ts`
- `app/(main)/chat/chat-view.tsx`（滚动触发时机）

---

## 4. 聊天列表不应显示最后一条消息内容

**问题描述**：`/messages` 聊天列表中每个聊天项会显示最后一行聊天内容（`lastMsg`），需要去掉，避免隐私泄露。

**当前行为**
- `app/(main)/messages/page.tsx` 的列表项渲染 `<p className="truncate">{chat.lastMsg}</p>`。
- `MockTelegramAdapter.getChats()` 会填充 `lastMsg` 为最后一条消息原文。
- `RealNostrAdapter.rebuildChats()` 目前将 `lastMsg` 置空，但 UI 仍保留了渲染位置。

**期望行为**
- 聊天列表中不再显示任何消息内容预览。
- 可保留联系人名称、头像、时间/未读数等元信息；最后一行消息文案区域移除或隐藏。
- 适配器侧可统一不填充 `lastMsg`（或保持为空），减少数据层依赖。

**影响文件**
- `app/(main)/messages/page.tsx`
- `lib/nostr/mock-telegram-adapter.ts`
- `lib/nostr/real-adapter.ts`（如需要统一置空）
- `lib/nostr/types.ts`（如决定移除 `lastMsg` 字段）

---

## 5. 按消息 ID 追踪“最新/已读”位置

**问题描述**：每个消息都有独立 ID，希望在进入聊天时通过 ID 判断哪些是最新消息，并在新消息到达时把最新 ID 更新到 localStorage，下次进入可据此判断。

**当前行为**
- 消息已包含唯一 `id`，但系统没有记录“上次看到的最新的消息 ID”。
- 进入聊天时无法区分“历史消息”与“本次新消息”。
- 聊天列表目前没有基于消息 ID 的未读/新消息提示。

**期望行为**
- 为每个聊天（以 `contactPubkey` 或 `chatId` 为键）在 localStorage 中维护一个 `lastReadMessageId`（或 `lastSeenMessageId`）。
- 当通过订阅收到新消息时，将其 ID 更新为该聊天的最新 ID。
- 进入聊天拉取历史消息后，可通过与存储的 ID 对比，识别哪些消息是新消息，并支持滚动定位或视觉标记。
- 与需求 #4 配合：聊天列表可显示“有新消息”或更新未读数，而不是显示消息内容。

**影响文件**
- `lib/storage.ts`（新增存储 key）
- `hooks/nostr/use-messages.ts`
- `app/(main)/chat/chat-view.tsx`
- `app/(main)/messages/page.tsx`（未读/新消息提示）

---

## 6. 默认屏显时间改为 10 秒

**问题描述**：消息遮罩的默认屏显时间目前是 5 秒，应改为 10 秒。

**当前行为**
- `lib/message-mask.ts` 中 `DEFAULT_MASK_SECONDS = 5`。
- 设置页下拉选项为 `[5, 10, 30, 0]`。

**期望行为**
- `DEFAULT_MASK_SECONDS` 默认值改为 `10`。
- 保持现有选项不变，仅调整默认值。

**影响文件**
- `lib/message-mask.ts`

---

## 7. 截屏设置切换后立即调用原生隐私屏动作

**问题描述**：设置页切换“允许截屏”后只写了 localStorage，没有立即调用原生 `PrivacyScreen` 的 enable/disable，导致当前运行中不生效。

**当前行为**
- `app/(main)/settings/page.tsx` 中截屏开关仅调用 `setScreenshotAllowed(next)` 并更新本地状态。
- `lib/privacy-screen.ts` 已提供 `enablePrivacy()` / `disablePrivacy()`，且 `@capacitor/privacy-screen` 已在 `capacitor.config.ts` 和 Android 工程中配置。
- `components/Providers.tsx` 只在应用启动时调用 `initPrivacyFromPreference()`。

**期望行为**
- 切换“允许截屏”开关时，立即根据新状态调用 `enablePrivacy()` 或 `disablePrivacy()`。
- 无需提示用户重启；可给出一个轻量成功提示（如“截屏设置已更新”），但不是“必须重启”。
- 同时保持 localStorage 偏好持久化，下次启动仍有效。

**影响文件**
- `app/(main)/settings/page.tsx`
- `lib/privacy-screen.ts`（如需要抽取同步切换函数）
- `public/locales/zh.json`
- `public/locales/en.json`

---

## 8. 遮罩固定宽度内字符数限制 / wrap 行为修正

**问题描述**：遮罩文本在固定宽度容器内自动折行时表现异常，需要限制每行/固定宽度内显示的字符数，避免 wrap 动作破坏布局。

**当前行为**
- 原文与遮罩文本共用同一套 CSS 自动换行，依赖浏览器 `break-words` 行为。
- 由于不同字符集的字宽不同，遮罩后的实际字符密度与原文不一致，导致相同容器宽度下显示行数/高度不同。

**期望行为**
- 在消息气泡的固定宽度内，遮罩文本与原文占据相同的视觉空间（行数、每行长度、气泡高度保持一致）。
- 调研并实施一种方案：例如测量容器宽度与字符平均宽度，限制每行最大字符数；或使用等宽字体/固定尺寸字符集；或根据实际渲染 break 位置手动插入换行。
- 与需求 #2 配合解决，确保原文 ↔ 遮罩切换时布局不发生跳动。

**影响文件**
- `components/chat/MaskedText.tsx`
- `lib/message-mask.ts`
- `app/(main)/chat/chat-view.tsx`（气泡 max-width/样式）

---

# 附录：待确认问题

1. **需求 1 中的“日期”**：是指消息列表（`/messages`）按最后消息时间排序，还是聊天详情（`/chat`）按日期分组？当前文档按“聊天详情按日期分组”理解。
2. **需求 5 的 localStorage key 命名**：是否接受 `dodobox_last_read_msg_<pubkey>`？是否需要区分身份（currentPubkey）前缀？
3. **需求 4 与需求 5 的关联**：去掉 `lastMsg` 后，聊天列表的未读/新消息提示是否依赖需求 5 的 ID 追踪来实现？
4. **需求 2/8 的优先级**：是否先采用“固定字符数/等宽字体”快速修复，后续再实现“测量真实 break 位置”的精确方案？
5. **需求 3 的延迟来源**：当前代码已做乐观更新，是否需要在 `handleSend` 中直接先清输入框并滚动，再进入队列，以进一步消除迟钝感？
