# CLI First 实现总结

> **分支**: `feat/cli-first` (从 `feat/deployable-mvp` 分出)
> **日期**: 2026-07-12
> **目标**: 用 CLI 命令行验证 Nostr 消息发送/接收的可靠性，剥离 UI 复杂度

---

## 已完成的工作

### Phase 0: 清理与结构重组 ✅

**删除的死代码（11 个文件）：**
- `hooks/use-mobile.ts` — 从未 import
- `lib/welshman/message-store.ts` — 4 个函数零调用者
- `lib/welshman/publish.ts` — 发布逻辑已在 relay-manager 中
- `lib/welshman/router-config.ts` — Welshman Router 未配置
- `lib/welshman/storage.ts` — IndexedDB 层未接入
- `lib/welshman/store-adapter.ts` — Svelte→React 桥接，不需要
- `lib/welshman/types.ts` — 纯 re-export barrel
- `scripts/cap-prebuild.js` / `cap-postbuild.js` — 不在 package.json 中
- `lib/nostr/relay-client.ts` — 整个文件未被引用
- `tests/unit/lib/nostr/relay-client.test.ts` — 对应测试文件

**删除的依赖（10 个包）：**
- `@capacitor/app`, `@capacitor/status-bar`, `@google/genai`, `@hookform/resolvers`
- `@welshman/app`, `@welshman/router`, `@welshman/store`, `class-variance-authority`
- `svelte`, `idb`

### Phase 1: CLI 核心模块 ✅

**新建文件：**

| 文件 | 行数 | 说明 |
|------|------|------|
| `cli/main.ts` | ~180 | CLI 入口：注册/登录、relay 连接、交互式聊天循环 |
| `cli/relay.ts` | ~60 | Relay 连接管理（Node.js 兼容） |
| `cli/sender.ts` | ~55 | 消息发送：buildEvent + giftWrap + publish |
| `cli/receiver.ts` | ~75 | 消息接收：subscribe + decryptGiftWrap |
| `cli/tsconfig.json` | ~15 | CLI 专用 TypeScript 配置 |
| `lib/messaging/session.ts` | ~95 | 会话管理：deriveMasterKey + vault 加解密 |
| `lib/messaging/vault-crypto-node.ts` | ~95 | Node.js 兼容的 AES-GCM 加密（替代 Web Crypto API） |
| `lib/messaging/sender.ts` | ~55 | 消息发送逻辑（共享给未来 UI） |
| `lib/messaging/receiver.ts` | ~75 | 消息接收逻辑（共享给未来 UI） |
| `lib/messaging/types.ts` | ~30 | CLI/UI 共用类型定义 |
| `lib/messaging/relay-node.ts` | ~150 | Node.js 兼容的 relay 连接/发布/订阅 |
| `lib/welshman/engine-node.ts` | ~45 | Node.js 版 welshman 初始化（跳过 IndexedDB） |

**修改的文件：**
- `lib/welshman/engine.ts` — 移除浏览器环境检查，支持 Node.js
- `package.json` — 移除 10 个未用依赖

### 架构设计

```
lib/messaging/                    ← 纯逻辑层（CLI + 未来 UI 共用）
├── session.ts                    ← 身份/会话管理
├── sender.ts                     ← 消息发送
├── receiver.ts                   ← 消息接收
├── types.ts                      ← 类型定义
└── relay-node.ts                 ← Node.js relay 连接

cli/                              ← CLI 实现（仅用于验证）
├── main.ts                       ← 入口 + 交互循环
├── relay.ts                      ← 连接管理
├── sender.ts                     ← 发送封装
└── receiver.ts                   ← 接收封装

lib/welshman/                     ← 精简后保留
├── engine.ts                     ← 浏览器版单例
├── engine-node.ts                ← Node.js 版单例（新增）
├── crypto.ts                     ← 签名/gift wrap（保留）
└── relay-manager.ts              ← 浏览器版 relay 管理（保留）
```

### 关键适配

1. **Node.js 兼容** — `vault-crypto-node.ts` 使用 `node:crypto` 的 `scryptSync` + `createCipheriv` 替代浏览器的 `crypto.subtle`
2. **Welshman Engine** — `engine-node.ts` 跳过 `Repository`（IndexedDB）和 `WrapManager`，只初始化 `Pool` 和 `Tracker`
3. **Nostr 协议一致** — 使用相同的 NIP-59 gift wrap、kind-14 DM、NIP-01 签名，与现有 UI 完全兼容

### 验证状态

- ✅ TypeScript 编译通过（`tsc --noEmit -p cli/tsconfig.json` 零错误）
- ✅ ESLint 通过（`pnpm lint` 零 warning）
- ✅ 单元测试通过（22 passed, 207 tests passed）
- ⏳ 端到端 relay 连接测试 — 需要真实网络环境验证

### 下一步

1. **端到端测试**：启动两个终端实例，分别以账户 A 和 B 登录，互相发消息验证
2. **Phase 2**：联系人管理、历史消息查看、中继质量评估
3. **回到 UI 层**：将 `lib/messaging/` 集成回 React 组件，修复已知的正确性问题

---

## 待验证事项

| 项目 | 风险 | 说明 |
|------|------|------|
| welshman Pool 在 Node.js 中的 WebSocket 兼容性 | 中 | 依赖 `ws` 库，需实际测试 |
| Node.js scryptSync vs Web Crypto PBKDF2 密钥派生一致性 | 低 | CLI 和 UI 使用不同 KDF，但仅用于本地加密，不影响协议 |
| Gift wrap 解密在 Node.js 中的兼容性 | 低 | @welshman/signer 应同时支持两种环境 |
| 现有 UI 代码冻结期间无功能变更 | 无 | 故意冻结 app/ 目录 |
