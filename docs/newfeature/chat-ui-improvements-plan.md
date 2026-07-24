# 计划：聊天页三项体验优化

> 状态：待实施（用户已确认需求，按本文档实施，不再反复改计划）
> 前置：无（与联系人 Tab 合并计划相互独立，可任意顺序）

## 需求 1：消息步进式加载（仿微信）

**现状问题**：每次进入聊天窗口，`getMessages` 一次性拉取全部历史（当前 `MESSAGE_FETCH_LIMIT = 100`，且无 `since`），消息一多又慢又费。

**目标**：
- 进入聊天只加载**最近一段**（建议：最近 1 天，或最近 ~50 条，取先到者），先渲染最近 2-3 屏
- 向上滑动**触顶时自动加载更早的一页**，加载完可继续往上翻（步进式，直到没有更多）
- 不在本地持久化消息；每次加载都是异步请求，不阻塞 UI
- 触顶加载时保持滚动位置不跳动（加载前记录滚动高度，插入后补偿）

**实现要点**（基于现有代码）：
- `lib/nostr/real-adapter.ts` `getMessages` 增加分页参数（`until` + `limit`）
- **注意 NIP-59 的坑**：gift wrap 的 `created_at` 被发送方随机回拨（最多 ~28h），分页边界必须带回放余量（如 `until = 最早一条的 created_at - 28h`），重复事件按 id 去重（去重逻辑已在 `use-messages` 就位）
- `hooks/nostr/use-messages.ts` 增加 `loadOlder()` 与 `hasMore` 状态
- `app/(main)/chat/chat-view.tsx` 滚动容器监听触顶 → 调 `loadOlder()`，顶部显示"加载中"指示
- 现有 seq 缺口检测（gap-detection）逻辑保持不动

## 需求 2：滑动时临时解除遮罩

**目标**：
- 在聊天窗口内发生**滚动行为时**，所有被遮罩的消息临时显示明文
- 停止滚动后，按设置页设定的秒数（如 5s）重新遮罩
- 必须同时兼容 web（鼠标滚轮）和 Android（touch 滑动）——直接监听容器的 `scroll` 事件即可两端通吃，不要单独监听 mouse/touch 事件

**实现要点**：
- `chat-view.tsx` 消息容器监听 `scroll`：滚动中 → 全局"揭示"状态开；停止滚动（防抖 ~150ms）→ 启动倒计时（= 遮罩秒数）→ 到时间全局恢复遮罩
- `MaskedText.tsx` 增加一个外部揭示信号（prop 或 context），与现有"点击单条揭示"逻辑共存
- 滚动揭示是**整块统一计时**（停止滚动后统一起算），不做每条消息各自计时

## 需求 3：遮罩字符集调整

- **移除**：`symbols`（符号 `#@%&$*?!§¶`）
- **新增**：`mongolian`（蒙文）、`tibetan`（藏文）
- 改动点：`lib/message-mask.ts` 的 `MASK_CHARSETS` 数组 + `public/locales/{en,zh}.json` 对应的 `settings.mask_charset_*` 文案
- 具体字符集内容实施时选定（从对应 Unicode 区块取一段字形好看的连续字符即可）
- 兼容：localStorage 里已存 `symbols` 的老用户，`getMaskCharsetId` 找不到 id 会自动回退默认值，无需迁移代码

## 验收

1. 进聊天只加载最近一段；触顶自动翻页加载更早消息，滚动位置不跳；历史翻到头不再触发
2. 滚动时全部明文；停滚后按设定秒数恢复遮罩；web 与 Android 均生效
3. 设置页字符集选项为：方块 / 韩文 / 盲文 / 蒙文 / 藏文（无符号）；选中蒙文/藏文后遮罩样式正确
4. `pnpm check` + `pnpm test` 通过

## 明确不做

- 消息本地持久化（用户明确不要）
- 消息搜索
- 改动 gap-detection / seq-counter 现有机制
