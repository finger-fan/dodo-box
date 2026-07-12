# DodoBox CLI-First 重构总结

> **日期**: 2026-07-12
> **分支**: `feat/cli-first` (基于 `feat/deployable-mvp`)
> **目标**: 先构建可靠的 CLI 消息管道，再包装 UI 层

---

## 一、审计发现 (2026-07-12)

### 综合评分: 6.2 / 10

| 维度 | 得分 | 状态 |
|------|------|------|
| 代码健康度 | 8.0 / 10 | ⚠️ WARNING |
| 正确性 | 6.5 / 10 | 🔴 NEEDS WORK |
| 安全性 | 5.5 / 10 | 🔴 NEEDS WORK |
| 性能/架构 | 6.0 / 10 | 🔴 NEEDS WORK |
| 开发者体验 | 4.6 / 10 | 🔴 NEEDS WORK |

### P0 问题 (阻塞合并)
1. `cap-deploy.sh` shell 注入漏洞 — 可远程执行命令
2. Relay 配置在身份操作中不传播 — 切换身份后消息发不出去
3. Mock Telegram chatId 碰撞 — 不同联系人消息互相覆盖

### P1 问题 (高优先级)
4. Bot token 通过 `NEXT_PUBLIC_` 暴露到客户端 JS bundle
5. Relay URL 无协议校验 → SSRF 风险
6. Vault salt 硬编码 → PBKDF2 被弱化
7. 发送失败时消息丢失（输入框先清空）
8. Message sort 全量 O(n log n)，长对话卡顿

### 死代码清理
- 删除 11 个未使用文件 (welshman 脚手架、relay-client 等)
- 移除 10 个未用依赖包
- ESLint 零 warning，207 测试通过

---

## 二、CLI-First 策略决策

### 为什么选择 CLI 优先

当前项目花了大量时间调试 UI 层问题（scroll、re-render、状态管理），但底层消息管道本身并不可靠。UI 的复杂度掩盖了协议层的问题。

**CLI 方案的优势:**
- 纯命令行输出，调试简单
- 无 React 状态管理干扰
- 直接验证 Nostr 协议可靠性
- 验证通过的逻辑可被 UI 复用

### 架构原则

```
lib/messaging/          ← 共享协议层 (CLI + UI 共用)
├── session.ts          ← 身份/会话管理
├── sender.ts           ← 消息发送 (NIP-59 gift wrap)
├── receiver.ts         ← 消息接收 (订阅 + 解密)
├── types.ts            ← 类型定义
├── relay-node.ts       ← Node.js relay 连接
└── vault-crypto-node.ts ← Node.js AES-GCM

cli/                    ← CLI 交互层 (仅 readline)
├── main.ts             ← 入口 + 交互循环
└── config.ts           ← CLI 本地配置

lib/welshman/           ← Welshman 适配层
├── engine.ts           ← 浏览器版单例
├── engine-node.ts      ← Node.js 版单例
├── crypto.ts           ← 签名/gift wrap
└── relay-manager.ts    ← 浏览器版 relay 管理
```

**关键设计:**
- `lib/messaging/` 是纯逻辑层，无框架依赖
- CLI 只负责 readline 交互和终端输出
- UI 未来可以直接 import `lib/messaging/` 的消息逻辑
- 两个前端共享同一套协议实现

---

## 三、已实施内容

### Phase 0: 清理与结构重组 ✅

**删除的死代码 (11 个文件):**
- `hooks/use-mobile.ts`
- `lib/welshman/message-store.ts`
- `lib/welshman/publish.ts`
- `lib/welshman/router-config.ts`
- `lib/welshman/storage.ts`
- `lib/welshman/store-adapter.ts`
- `lib/welshman/types.ts`
- `scripts/cap-prebuild.js`
- `scripts/cap-postbuild.js`
- `lib/nostr/relay-client.ts`
- `tests/unit/lib/nostr/relay-client.test.ts`

**删除的依赖 (10 个包):**
- `@capacitor/app`, `@capacitor/status-bar`, `@google/genai`, `@hookform/resolvers`
- `@welshman/app`, `@welshman/router`, `@welshman/store`, `class-variance-authority`
- `svelte`, `idb`

### Phase 1: CLI 核心消息管道 ✅

**新建文件:**

| 文件 | 行数 | 说明 |
|------|------|------|
| `cli/main.ts` | ~180 | CLI 入口：注册/登录、relay 连接、交互式聊天循环 |
| `lib/messaging/session.ts` | ~117 | 会话管理：deriveMasterKey + vault 加解密 |
| `lib/messaging/vault-crypto-node.ts` | ~103 | Node.js 兼容 AES-GCM (替代 Web Crypto API) |
| `lib/messaging/sender.ts` | ~68 | 消息发送：buildEvent + giftWrap + publish |
| `lib/messaging/receiver.ts` | ~79 | 消息接收：subscribe + decryptGiftWrap |
| `lib/messaging/types.ts` | ~33 | CLI/UI 共用类型定义 |
| `lib/messaging/relay-node.ts` | ~173 | Node.js 兼容 relay 连接/发布/订阅 |
| `lib/welshman/engine-node.ts` | ~45 | Node.js 版 welshman 初始化 (跳过 IndexedDB) |

**修改的文件:**
- `lib/welshman/engine.ts` — 移除浏览器环境检查，支持 Node.js
- `package.json` — 移除 10 个未用依赖

**关键适配:**
1. **Node.js 兼容** — `vault-crypto-node.ts` 使用 `node:crypto` 的 `scryptSync` + `createCipheriv` 替代浏览器的 `crypto.subtle`
2. **Welshman Engine** — `engine-node.ts` 跳过 `Repository` (IndexedDB) 和 `WrapManager`，只初始化 `Pool` 和 `Tracker`
3. **Nostr 协议一致** — 使用相同的 NIP-59 gift wrap、kind-14 DM、NIP-01 签名，与现有 UI 完全兼容

### Phase 2: CLI 增强功能 ✅

**新建文件:**

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/messaging/contacts.ts` | ~217 | 联系人管理 (add/remove/list)、npub 解码、历史消息查询 |
| `lib/messaging/profile.ts` | ~93 | Nostr profile (kind:0) 查询 + 内存缓存 |
| `lib/messaging/relay-quality.ts` | ~145 | 中继质量监控 (延迟 + 成功率) |
| `cli/config.ts` | ~70 | CLI 本地配置管理 (`~/.dodobox/config.json`) |

### Phase 3: 代码分层重构 ✅

**问题**: Phase 2 将 contacts/profile/quality 直接创建在 `cli/` 下，但这些是协议层逻辑，不应属于 CLI 模块。

**重构操作**: 将共享协议逻辑从 `cli/` 迁移到 `lib/messaging/`

| 原位置 | 新位置 | 说明 |
|--------|--------|------|
| `cli/contacts.ts` | `lib/messaging/contacts.ts` | 联系人管理 + 历史消息 |
| `cli/profile.ts` | `lib/messaging/profile.ts` | Profile 查询 |
| `cli/quality.ts` | `lib/messaging/relay-quality.ts` | 中继质量测试 |
| `cli/sender.ts` | `lib/messaging/sender.ts` | 消息发送 (已有) |
| `cli/receiver.ts` | `lib/messaging/receiver.ts` | 消息接收 (已有) |
| `cli/relay.ts` | `lib/messaging/relay-node.ts` | Relay 连接 (已有) |

**最终架构**:

```
lib/messaging/          ← 共享协议层 (框架无关，CLI + UI 共用)
├── session.ts          ← 身份/会话管理
├── sender.ts           ← 消息发送 (NIP-59 gift wrap)
├── receiver.ts         ← 消息接收 (订阅 + 解密)
├── types.ts            ← 类型定义
├── relay-node.ts       ← Node.js relay 连接
├── vault-crypto-node.ts ← Node.js AES-GCM
├── contacts.ts         ← 联系人管理 + 历史消息
├── profile.ts          ← Profile 查询
└── relay-quality.ts    ← 中继质量测试

cli/                    ← CLI 交互层 (仅 readline 终端输出)
├── main.ts             ← 入口 + 交互循环
└── config.ts           ← CLI 本地配置

lib/welshman/           ← Welshman 适配层
├── engine.ts           ← 浏览器版单例
├── engine-node.ts      ← Node.js 版单例
├── crypto.ts           ← 签名/gift wrap
└── relay-manager.ts    ← 浏览器版 relay 管理
```

**关键设计原则**:
- `lib/messaging/` 是纯逻辑层，无框架依赖
- CLI 只负责 readline 交互和终端输出
- UI 未来可以直接 import `lib/messaging/` 的消息逻辑
- 两个前端共享同一套协议实现
- CLI 不持有协议逻辑（contacts/profile/quality 都是协议层功能）

---

## 四、当前验证状态

| 检查项 | 状态 | 说明 |
|--------|------|------|
| TypeScript 编译 | ✅ 0 errors | `tsc --noEmit -p cli/tsconfig.json` |
| ESLint | ✅ 0 issues | `pnpm lint` |
| 单元测试 | ✅ 207 passed | `pnpm test` |
| 端到端 relay 测试 | ⏳ 待验证 | 需要真实网络环境 |
| CLI 实际运行 | ❌ 未测试 | 需要手动运行验证 |

### 代码分层状态

| 层级 | 内容 | 状态 |
|------|------|------|
| `lib/messaging/` (共享协议层) | session, sender, receiver, contacts, profile, relay-quality | ✅ 已完成 |
| `cli/` (交互层) | main.ts (readline), config.ts | ✅ 已完成 |
| `lib/welshman/` (适配层) | engine, crypto, relay-manager | ✅ 已完成 |

---

## 五、下一步计划

### 短期 (本迭代)

1. **验证 CLI 基本功能**
   ```bash
   # 终端 1: 账户 A
   npx tsx cli/main.ts
   # 输入用户名/密码注册
   
   # 终端 2: 账户 B
   npx tsx cli/main.ts
   # 输入用户名/密码注册
   
   # 账户 A 给账户 B 发消息
   # 复制账户 B 的 pubkey (64 hex chars)
   # 粘贴到账户 A 的 CLI 中
   # 发送消息，观察账户 B 是否收到
   ```

2. **修复已知问题**
   - 确认 `initTracking` 等函数正确导入
   - 验证 gift wrap 在 Node.js 环境下的兼容性
   - 测试 welshman Pool 在 Node.js WebSocket 的表现

### 中期 (下迭代)

3. **完善 CLI 功能**
   - 联系人管理 (add/remove/list)
   - 历史消息查询 (`/history <pubkey>`)
   - Profile 查询 (`/profile <pubkey>`)
   - 中继质量测试 (`/quality`)

4. **UI 集成**
   - 将 `lib/messaging/` 集成回 React 组件
   - 替换 `NostrContext` 中的 relay 连接逻辑
   - 替换 `use-messages` 中的发送/接收逻辑
   - 修复已知的正确性问题 (relay 传播、message sort)

### 长期

5. **回到 UI 层**
   - 逐步恢复被冻结的 `app/` 目录功能
   - 修复 discover 页面空白问题
   - 拆分 `settings/page.tsx` (422 行 god component)
   - 统一 relay 配置来源

---

## 六、已知风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| welshman Pool 在 Node.js 中的 WebSocket 兼容性 | 中 | 先用 CLI 验证，有问题再修 welshman |
| Node.js scryptSync vs Web Crypto PBKDF2 密钥派生一致性 | 低 | CLI 和 UI 使用不同 KDF，但仅用于本地加密，不影响协议 |
| Gift wrap 解密在 Node.js 中的兼容性 | 低 | @welshman/signer 应同时支持两种环境 |
| 现有 UI 代码冻结期间无功能变更 | 无 | 故意冻结 app/ 目录，直到 CLI 验证通过 |

---

## 七、文件清单

### 新增文件 (Phase 0+1+2+3)
```
cli/
├── main.ts              ← CLI 入口 + 交互循环
└── config.ts            ← CLI 本地配置管理

lib/messaging/
├── session.ts           ← 会话管理
├── sender.ts            ← 消息发送逻辑
├── receiver.ts          ← 消息接收逻辑
├── types.ts             ← 类型定义
├── relay-node.ts        ← Node.js relay 层
├── vault-crypto-node.ts ← Node.js 加密模块
├── contacts.ts          ← 联系人管理 + 历史消息
├── profile.ts           ← Profile 查询
└── relay-quality.ts     ← 中继质量测试

lib/welshman/
└── engine-node.ts       ← Node.js 引擎初始化
```

### 删除文件
```
hooks/use-mobile.ts
lib/welshman/message-store.ts
lib/welshman/publish.ts
lib/welshman/router-config.ts
lib/welshman/storage.ts
lib/welshman/store-adapter.ts
lib/welshman/types.ts
scripts/cap-prebuild.js
scripts/cap-postbuild.js
lib/nostr/relay-client.ts
tests/unit/lib/nostr/relay-client.test.ts
```

### 修改文件
```
lib/welshman/engine.ts     ← 移除浏览器检查
package.json               ← 移除 10 个未用依赖
pnpm-lock.yaml             ← 依赖更新
tsconfig.json              ← baseUrl 选项修复
```

---

## 八、后续开发指引

### 接续开发步骤

1. **确认 CLI 可用**
   ```bash
   git checkout feat/cli-first
   pnpm install
   npx tsx cli/main.ts
   ```

2. **测试消息收发**
   - 打开两个终端
   - 分别以不同用户登录
   - 互相发送消息验证

3. **完善 CLI 功能**
   - 添加联系人管理
   - 添加历史消息查询
   - 添加 profile 查询
   - 添加中继质量测试

4. **UI 集成**
   - 将 `lib/messaging/` 逻辑集成到 React 组件
   - 修复 relay 传播等问题
   - 逐步恢复 UI 功能

### 注意事项
- `lib/messaging/` 是纯逻辑层，无框架依赖
- CLI 和 UI 共享同一套消息逻辑
- 现有 `app/` 目录保持冻结，直到 CLI 验证通过
- 所有新代码遵循 TypeScript strict mode

---

*文档生成于 2026-07-12*
*分支: feat/cli-first*
*基于审计报告: docs/audit-report-2026-07-12.md*
