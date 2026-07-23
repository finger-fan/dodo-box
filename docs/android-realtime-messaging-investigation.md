# Android 实时消息收不到：根因调查与修复总结

> 日期：2026-07-24
> 现象：Android（Capacitor WebView）端收不到实时消息推送；退出聊天页重进（触发重新 fetch）却能拿到消息。web ↔ web 双向正常，Android → web 发送正常，web → Android 实时推送失败。
> 附带问题：Safari 控制台持续刷 React duplicate key 警告。

## 根因（已验证修复）

**华为 WebView 114（Chromium 114）缺少 `AbortSignal.any()`（Chrome 116+ 才有）。**

失效链条：

1. welshman 的 `request()`（`@welshman/net/dist/net/src/request.js:107`）在调用方传了 `signal` 时必走 `AbortSignal.any([...])`。
2. 我们的**实时订阅**传了 signal，**fetch 没传** —— 这是两条路径唯一的差别。
3. 老 WebView 上调用即抛 `TypeError`，promise reject，**REQ 从未发到 relay**（连 EOSE 都没有）。
4. 该错误被 `relay-manager.ts` 里的 `.catch(() => {})` 静默吞掉，无任何日志。

这解释了全部现象：fetch 正常（重进能拿到消息）、发送正常（publish 不走此 API）、实时订阅死透、web 端正常（现代浏览器都有此 API）。

## 修复内容

### 1. Polyfill（根治）
- 新增 `lib/welshman/polyfills.ts`：检测 `AbortSignal.any` 缺失时用 `AbortController` 事件监听实现并挂载，应用时打 warn 日志。
- `lib/welshman/engine.ts` 的 `initEngine()` 启动时应用。

### 2. 消除静默失败
- `relay-manager.ts` 的 `.catch(() => {})` 改为：非主动 abort 的失败一律 `log.error`。
- 补上 `onClosed`（relay 拒绝及原因）、`onDisconnect`、`onDuplicate`、`onFiltered`、`onInvalid` 日志。

### 3. 帧级诊断日志
- `frame OUT: REQ/CLOSE`：证明 REQ 帧真的离开设备（此前的 `REQ issued` 只是调用前，证明不了）。
- `frame IN: EOSE/CLOSED/NOTICE/EVENT`：relay 的任何回应。
- 判定原则：**任何过滤（since/matchFilters/Tracker/解密）都发生在事件到达之后，没有一环能吞掉 EOSE。无 EOSE = REQ 没到达 relay。**

### 4. duplicate key 修复
- 原因：`subscribeToMessages` 过滤器无 `since`/`limit`，每次进聊天页 relay 全量重放历史；`useMessages` 订阅回调 append 时未按 id 去重，与 fetch 结果重复入列。
- 修复：`hooks/nostr/use-messages.ts` 订阅回调按消息 id 去重。

### 5. 订阅韧性增强（第二道防线）
- `relay-manager.ts` 新增活跃订阅注册表：socket 重连后自动重发原始过滤器的 REQ（官方 `socketPolicyCloseInactive` 也会重发，但会给 filter 加 `since`，会漏掉 created_at 随机回拨的 NIP-59 gift wrap）。
- 心跳探活：每 30s（仅前台）发只读 `limit 1` 查询，6s 无 EOSE 判定假死（zombie TCP 不触发 close/error，官方 ping 只发不收发现不了），强制 close+open。
- `visibilitychange`（回前台）/ `online`（网络恢复）时强制重建所有订阅。
- `closeAllRelays` 时清理注册表。

### 6. 构建号（分钟级新鲜度验证）
- `scripts/sync-version.js` 每次构建生成时间戳写入 package.json `build` 字段（格式：年末位+月+日+时+分，如 `607240117`）。
- `next.config.ts` 暴露为 `NEXT_PUBLIC_APP_BUILD`，设置页显示 `0.9.9 (607240117)`。

### 7. 拷贝脚本时区 bug
- `scripts/copy-apk-to-download.js` 原用 `new Date().toISOString()`（UTC）命名 APK，北京时间 0–8 点打包会错标成前一天；改为本地时间。Gradle 侧 `outputFileName` 一直用本地时间，两边现在一致。
- `findApk()` 由"取字母序第一个"改为"取 mtime 最新"，防御输出目录存在多个 APK 时拷错。

## 调查过程中排除的假设

| 假设 | 排除依据 |
|------|----------|
| relay 拒绝订阅 REQ | web 端同款 REQ 正常回答；且 relay 若拒绝会回 CLOSED/EOSE |
| 消息被 since/filter 过滤 | 本次会话 socket 未断连，policy 不会加 since；且过滤吞不掉 EOSE |
| WebSocket 断线/假死 | socket 全新连接且之后无断连日志；探活日志无异常 |
| 设备时钟不一致 | wrap 的 created_at 回拨是发送方主动随机化，与时钟无关 |
| 装的 APK 是旧包 | 新日志出现在设备输出中，证明安装生效；MD5 验证拷贝内容一致 |

## 经验教训

1. **永不静默吞错**：`.catch(() => {})` 让一个简单的 API 缺失变成了数小时的跨层排查。订阅链路上每个环节都应有日志。
2. **先分层打日志，再谈修复**：`socket状态 → REQ出 → EOSE回 → 事件到 → 解密 → 匹配 → UI` 的漏斗让断点一目了然。
3. **老 WebView = 老 Chromium**：Capacitor 应用的 JS API 可用性取决于设备 WebView 版本，新 API 使用前要确认 Baseline 或加 polyfill。
4. **UTC 是凌晨打包的坑**：凡涉及文件名/日期的脚本，明确用本地时间还是 UTC，并和构建系统（Gradle 用本地时间）保持一致。
5. **分钟级构建号**让"装的是不是新包"从猜测变成一眼确认。

## 测试

- `tests/unit/lib/welshman/relay-manager.test.ts` 新增 5 例：首连不重复 REQ、重连重发、abort 后不重发、探活超时回收假死 socket、健康 socket 不动。
- 新增 `tests/unit/hooks/use-messages.test.tsx`：订阅回调去重。
- 真机验证通过：Android 实时收到 web 端消息。
