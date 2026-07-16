# TEST-TODO

> 测试任务清单。`[ ]` = 未领取，`[x]` = 已领取。
> 使用 `/loop` 领取任务时，将对应 `[ ]` 改为 `[x]`。

---

## 当前状态

- **204 tests** passing (17 files: 10 unit + 3 integration + 4 E2E)
- **覆盖率估算**: 70-75%（adapter/messages 强，UI/identity 弱）
- **目标**: 80%+ 覆盖率，消息不丢失，联系人显示正确

---

## P0 - 消息可靠性（Message Rush / 丢失检测）

### 消息排序与去重

- [ ] **T-MSG-01**: 测试 seq counter 乱序到达时的正确排序（模拟 relay 乱序投递）
- [ ] **T-MSG-02**: 测试重复消息 ID 去重（同一 event 从多个 relay 到达）
- [ ] **T-MSG-03**: 测试多发送者交叉消息排序（A→B 和 B→A 同时发送 10 条）
- [ ] **T-MSG-04**: 测试 timestamp 相同时的稳定排序（fallback 到 event ID）

### Gap Recovery（消息缺口恢复）

- [ ] **T-MSG-05**: 单元测试 `recoverGap()` 函数 - 正常恢复场景
- [ ] **T-MSG-06**: 单元测试 `recoverGap()` 函数 - relay 返回空结果
- [ ] **T-MSG-07**: 单元测试 `recoverGap()` 函数 - relay 超时
- [ ] **T-MSG-08**: E2E 测试 gap indicator UI 显示和用户点击恢复交互
- [ ] **T-MSG-09**: 集成测试 gap detection + recovery 完整流程

### 消息发送可靠性

- [ ] **T-MSG-10**: 测试 `retrySend()` 重试逻辑（失败消息重发）
- [ ] **T-MSG-11**: E2E 测试失败消息 UI 状态（红色标记 + 重试按钮）
- [ ] **T-MSG-12**: 测试 rapid send 20+ 条并发消息无丢失（扩展现有 10 条测试）
- [ ] **T-MSG-13**: 测试 send 失败后 optimistic message 正确回滚
- [ ] **T-MSG-14**: 测试两个 gift wrap（recipient + self）都成功发布才算成功

### 消息订阅与实时接收

- [ ] **T-MSG-15**: 测试 subscription 断开后自动重连并补齐缺失消息
- [ ] **T-MSG-16**: 测试多个 chat 同时接收消息时的隔离性（A 的消息不出现在 B 的 chat）
- [ ] **T-MSG-17**: 测试 gift wrap 解密失败时的优雅降级（不崩溃，记录错误）

---

## P0 - 联系人显示正确性

### 名称解析与显示

- [ ] **T-CON-01**: 测试联系人名称解析优先级：petname > profile.display_name > profile.name > npub 截断
- [ ] **T-CON-02**: 测试 profile 获取失败时 fallback 到 npub 短格式显示
- [ ] **T-CON-03**: 测试联系人名称在 chat list 中的正确显示（集成 contact cache）
- [ ] **T-CON-04**: 测试联系人名称在 chat detail header 中的正确显示
- [ ] **T-CON-05**: 测试 hex pubkey 在 UI 中永远不直接显示（应转为 npub 或名称）

### Contact Cache 一致性

- [ ] **T-CON-06**: 测试 cache 启用时，页面刷新后联系人名称不闪烁回 hex
- [ ] **T-CON-07**: 测试 cache 禁用时，从 relay 获取最新联系人数据
- [ ] **T-CON-08**: 测试 cache 与 relay 数据不一致时的合并策略（relay 优先）
- [ ] **T-CON-09**: 测试多账户切换时 cache 隔离（A 的联系人不泄漏到 B）
- [ ] **T-CON-10**: 测试 cache 中 JSON 损坏时的降级处理（已有部分覆盖，补充边界情况）

### 添加/删除联系人

- [ ] **T-CON-11**: E2E 测试添加联系人完整流程（打开 modal → 输入 npub → 确认 → 列表更新）
- [ ] **T-CON-12**: E2E 测试删除联系人流程（滑动 → 确认对话框 → 确认删除 → 列表更新）
- [ ] **T-CON-13**: 测试添加重复联系人的拒绝逻辑
- [ ] **T-CON-14**: 测试 `dodobox://contact/<encoded-pubkey>` 协议解析和添加
- [ ] **T-CON-15**: 测试添加联系人后 follow list (kind:3) 正确发布到 relay

---

## P1 - 身份管理（Identity）

### 多身份切换

- [ ] **T-IDT-01**: 测试 `switchIdentity()` 切换后 session 更新
- [ ] **T-IDT-02**: 测试切换身份后聊天列表刷新为新身份的数据
- [ ] **T-IDT-03**: 测试切换身份后联系人列表刷新
- [ ] **T-IDT-04**: 测试快速连续切换身份不会产生竞态条件

### 身份 CRUD

- [ ] **T-IDT-05**: 测试 `createIdentity()` 成功创建并加入 vault
- [ ] **T-IDT-06**: 测试 `deleteIdentity()` 从 vault 移除
- [ ] **T-IDT-07**: 测试 `updateIdentityName()` 更新显示名称
- [ ] **T-IDT-08**: 测试删除当前活跃身份后自动切换到其他身份
- [ ] **T-IDT-09**: 测试删除最后一个身份的处理逻辑

### Vault 恢复

- [ ] **T-IDT-10**: 测试 login 时 vault 从 relay 恢复
- [ ] **T-IDT-11**: 测试 vault sync 失败后的重试
- [ ] **T-IDT-12**: 测试页面刷新后 private key 丢失的自动登出

---

## P1 - Relay 连接稳定性

### 连接管理

- [ ] **T-RLY-01**: 测试 WebSocket 断开后的自动重连
- [ ] **T-RLY-02**: 测试指数退避重试策略（1s → 2s → 4s → ...）
- [ ] **T-RLY-03**: 测试连接超时处理
- [ ] **T-RLY-04**: 测试多 relay 场景下的连接管理

### 订阅管理

- [ ] **T-RLY-05**: 测试 subscription 创建和取消
- [ ] **T-RLY-06**: 测试页面卸载时 subscription 正确清理
- [ ] **T-RLY-07**: 测试重连后 subscription 自动恢复

---

## P1 - Chat 列表与构建

### Chat 构建

- [ ] **T-CHT-01**: 测试 `rebuildChats()` 从联系人列表构建 chat 列表
- [ ] **T-CHT-02**: 测试新消息到达时 chat 列表排序更新（最新消息置顶）
- [ ] **T-CHT-03**: 测试 chat 的 lastMessage 和 unread count 正确更新
- [ ] **T-CHT-04**: 测试 chat cache 持久化和恢复

### Chat 显示

- [ ] **T-CHT-05**: E2E 测试 chat list 中显示联系人名称（非 hex）
- [ ] **T-CHT-06**: E2E 测试 chat list 中最后一条消息预览
- [ ] **T-CHT-07**: E2E 测试空 chat list 状态
- [ ] **T-CHT-08**: E2E 测试 chat 搜索/过滤功能

---

## P2 - 错误状态与降级

### 网络错误

- [ ] **T-ERR-01**: 测试 relay 完全不可达时的 UI 提示
- [ ] **T-ERR-02**: 测试发送消息时网络断开的处理
- [ ] **T-ERR-03**: 测试获取联系人/消息超时的 UI 反馈

### 数据错误

- [ ] **T-ERR-04**: 测试 localStorage 数据损坏时的降级
- [ ] **T-ERR-05**: 测试 Nostr event 格式非法时的处理
- [ ] **T-ERR-06**: 测试 gift wrap 解密密钥不匹配时的处理

### 组件错误边界

- [ ] **T-ERR-07**: 测试 ErrorView 组件渲染
- [ ] **T-ERR-08**: 测试 Toast 多条排队显示
- [ ] **T-ERR-09**: 测试 ConfirmDialog 确认/取消/dismiss 三种操作

---

## P2 - UI 组件

### SwipeableListItem

- [ ] **T-UI-01**: 测试滑动手势触发 action
- [ ] **T-UI-02**: 测试滑动阈值（不足阈值时回弹）

### Settings 页面

- [ ] **T-UI-03**: 单元测试 settings 各选项的状态切换
- [ ] **T-UI-04**: 测试 relay 配置编辑和保存
- [ ] **T-UI-05**: 测试 identity modal 打开/编辑/关闭流程

### Discover 页面

- [ ] **T-UI-06**: E2E 测试 discover 页面基本加载
- [ ] **T-UI-07**: 测试频道订阅流程
- [ ] **T-UI-08**: 测试帖子流显示

---

## P3 - 基础设施

### 未测试文件补充

- [ ] **T-INF-01**: 测试 `lib/nostr/index.ts` factory 函数 `createNostrAdapter()`
- [ ] **T-INF-02**: 测试 `lib/nostr/empty-adapter.ts` 所有方法返回空/默认值
- [ ] **T-INF-03**: 测试 `components/Providers.tsx` theme 和 i18n 初始化
- [ ] **T-INF-04**: 测试 `app/(main)/layout.tsx` auth guard 重定向逻辑
- [ ] **T-INF-05**: 测试 `components/UpdateChecker.tsx` 版本检查逻辑

### 多账户 E2E

- [ ] **T-INF-06**: E2E 完整多账户流程：注册 A → 注册 B → A 加 B → A 发消息 → B 收到
- [ ] **T-INF-07**: E2E 测试账户切换后数据隔离
- [ ] **T-INF-08**: E2E 测试 `dodobox://identity/<privkey>` 导入身份

---

## 任务统计

| 优先级 | 总数 | 已领 | 剩余 |
|--------|------|------|------|
| P0 - 消息可靠性 | 17 | 0 | 17 |
| P0 - 联系人显示 | 15 | 0 | 15 |
| P1 - 身份管理 | 12 | 0 | 12 |
| P1 - Relay 连接 | 7 | 0 | 7 |
| P1 - Chat 列表 | 8 | 0 | 8 |
| P2 - 错误状态 | 9 | 0 | 9 |
| P2 - UI 组件 | 8 | 0 | 8 |
| P3 - 基础设施 | 8 | 0 | 8 |
| **合计** | **84** | **0** | **84** |
