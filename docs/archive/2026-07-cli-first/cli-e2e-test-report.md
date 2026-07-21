# CLI 端到端测试报告

> **日期**: 2026-07-12
> **分支**: `feat/cli-first`
> **测试人**: Claude (测试员角色)
> **版本**: 基于 Phase 3 完成后的代码

---

## 一、测试目标

验证 CLI 消息管道的端到端可靠性：
1. 两个独立 CLI 实例能否注册并连接 relay
2. 账户 A 能否发送消息给账户 B
3. 账户 B 能否接收并显示消息
4. 双向通信是否正常

---

## 二、测试环境

| 项目 | 配置 |
|------|------|
| Node.js | v22.23.1 |
| TypeScript | 5.9 |
| 测试方式 | 自动化脚本驱动两个 CLI 子进程 |
| Relay | wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band |
| 加密方式 | NIP-59 gift wrap |

---

## 三、测试步骤

### 3.1 自动化测试脚本

编写 `e2e-test-cli.ts`，通过 `child_process.spawn` 启动两个独立的 CLI 实例：
- **CLI A**: 用户名 `alice`，密码 `pass123`，HOME=`.test-home-a`
- **CLI B**: 用户名 `bob`，密码 `pass123`，HOME=`.test-home-b`

### 3.2 测试流程

1. **注册阶段**
   - 启动 CLI A 和 CLI B
   - 分别输入用户名/密码完成注册
   - 提取各自的 pubkey（64 hex chars）

2. **等待就绪**
   - 等待两个 CLI 都连接到 relay（3/3 连接）
   - 等待出现交互提示符 `> `

3. **A → B 发送测试**
   - CLI A 输入 B 的 pubkey
   - CLI A 输入消息 `hello bob from alice!`
   - 等待 CLI A 显示 `✅ Sent!`
   - 等待 CLI B 显示收到消息

4. **B → A 发送测试**
   - CLI B 输入 A 的 pubkey
   - CLI B 输入消息 `hello alice from bob!`
   - 等待 CLI B 显示 `✅ Sent!`
   - 等待 CLI A 显示收到消息

---

## 四、测试结果

### 4.1 总体结果

✅ **测试通过** — 双向消息收发成功

### 4.2 详细结果

| 检查项 | 状态 | 说明 |
|--------|------|------|
| CLI A 注册 | ✅ | 成功注册 @alice，生成 pubkey |
| CLI B 注册 | ✅ | 成功注册 @bob，生成 pubkey |
| Relay 连接 (A) | ✅ | 3/3 relays 连接成功 |
| Relay 连接 (B) | ✅ | 3/3 relays 连接成功 |
| A → B 发送 | ✅ | 消息成功发布到 1-2 个 relay |
| A → B 接收 | ✅ | B 收到消息 `hello bob from alice!` |
| B → A 发送 | ✅ | 消息成功发布到 2 个 relay |
| B → A 接收 | ✅ | A 收到消息 `hello alice from bob!` |

### 4.3 日志摘要

```
🚀 Spawning CLI A (alice) and CLI B (bob)...
[A] ✅ Registered as @alice
[A]    Pubkey: 786ee6d11a1985df...
[A] ✅ Connected to 3/3 relays.

[B] ✅ Registered as @bob
[B]    Pubkey: 2672014b875f9b9a...
[B] ✅ Connected to 3/3 relays.

📨 A → B: "hello bob from alice!"
[A]   ✅ Sent! Event: c4fd07049208d20b... (1 relays)
[B] 📨 From 786ee6d1...: "hello bob from alice!"
✅ B received!

📨 B → A: "hello alice from bob!"
[B]   ✅ Sent! Event: c223f4c6aadcd5cc... (2 relays)
[A] 📨 From 2672014b...: "hello alice from bob!"
✅ A received!

🎉 E2E test PASSED — bidirectional messaging works!
```

---

## 五、发现并修复的问题

### 5.1 Engine 单例重复问题

**问题描述**:
`lib/welshman/engine.ts` 和 `lib/welshman/engine-node.ts` 各自维护独立的 pool/tracker 单例。CLI 通过 `engine-node.ts` 连接 relay，但发送消息时 `sender.ts` 调用 `relay-manager.ts`，后者使用 `engine.ts` 的 pool — 导致发送到未连接的 pool。

**修复方案**:
让 `engine.ts` 支持 `nodeMode` 选项（跳过 Repository/WrapManager），`engine-node.ts` 改为委托给 `engine.ts`。

**修复文件**:
- `lib/welshman/engine.ts` — 添加 `nodeMode` 参数
- `lib/welshman/engine-node.ts` — 改为薄包装层

### 5.2 Publish Status 检查错误

**问题描述**:
welshman `publish()` 返回 `status: 'success'`，但 `sender.ts` 检查的是 `status === 'published'`，导致误判所有发送失败。

**修复方案**:
同时接受 `'success'` 和 `'published'` 两种状态。

**修复文件**:
- `lib/messaging/sender.ts` — 修改状态检查逻辑

### 5.3 Receiver 解析逻辑不兼容

**问题描述**:
发送端 `buildDirectMessageEvent` 直接传纯字符串作为 content，但接收端 `parseInnerEvent` 尝试 `JSON.parse(event.content)`，导致解析失败并打印警告 `[receiver] Failed to parse inner event: <消息文本>`。

**修复方案**:
接收端先尝试 JSON 解析，失败后 fallback 到纯文本。

**修复文件**:
- `lib/messaging/receiver.ts` — 添加 try-catch fallback

### 5.4 消息重复接收（已知问题）

**问题描述**:
同一条消息可能从多个 relay 到达，导致重复显示（测试中观察到单条消息显示 4 次）。

**修复方案**:
在 `receiver.ts` 中添加 `seenEventIds` Set，按 event ID 去重。

**状态**: ⚠️ 已实现，但需要验证是否有副作用（跨 relay 延迟到达的消息可能被误判为重复）。

---

## 六、测试后清理

测试完成后自动清理：
- 删除 `.test-home-a/` 和 `.test-home-b/` 目录
- 删除临时测试文件 `e2e-test-cli.ts` 和 `test-publish.ts`

---

## 七、结论

CLI 消息管道的核心功能验证通过：
- ✅ 注册/登录流程正常
- ✅ Relay 连接稳定（3/3 relays）
- ✅ 消息发送成功（NIP-59 gift wrap 加密）
- ✅ 消息接收正常（实时订阅）
- ✅ 双向通信可靠

**已知风险**:
- 消息去重逻辑可能需要进一步优化（当前基于 event ID，跨 relay 场景需验证）
- 1/3 relay 偶尔超时（relay.nostr.band），但不影响核心功能

**建议下一步**:
1. 手动运行 CLI 验证交互体验
2. 测试联系人管理功能（`/add`, `/contacts`, `/remove`）
3. 测试历史消息查询（`/history <pubkey>`）
4. 测试 profile 查询（`/profile <pubkey>`）

---

*报告生成于 2026-07-12*
*测试工具: Claude (测试员角色)*
*分支: feat/cli-first*
