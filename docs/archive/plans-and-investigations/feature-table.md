# 功能表

> 从 git 历史中提取的完整功能清单，按版本/阶段组织。

---

## 核心功能

| 模块 | 功能 | 状态 | 来源 Commit |
|------|------|------|-------------|
| **App 框架** | Next.js 15 App Router + React 19 + TypeScript 5.9 | 已完成 | `21457bf` |
| **路由** | 登录 / 消息列表 / 聊天 / 联系人 / 发现 / 设置 | 已完成 | `21457bf` |
| **底部导航** | BottomNav 组件，聊天详情页隐藏 | 已完成 | `21457bf` |
| **暗色模式** | next-themes class 策略，系统/手动切换 | 已完成 | `57b72d1` |
| **i18n** | i18next 中英双语，浏览器语言检测，localStorage 持久化 | 已完成 | `57b72d1` |
| **发现页** | 频道订阅与帖子流 | 已完成 | `83e0cd8` |

## Nostr 协议层

| 模块 | 功能 | 状态 | 来源 Commit |
|------|------|------|-------------|
| **Vault 身份管理** | 用户名+密码派生 Account，Account 下创建 Identity | 已完成 | `49ed538` |
| **密钥派生** | key-derivation 模块 | 已完成 | `49ed538` |
| **Vault 加密** | vault-crypto 加解密 | 已完成 | `49ed538` |
| **Relay 客户端** | WebSocket 连接、订阅、EOSE 处理 | 已完成 | `49ed538` |
| **Vault 同步** | relay 上的 vault 存取、EOSE 即时 resolve | 已完成 | `49ed538` |
| **NIP-17 DM** | 加密私信收发 | 已完成 | `49ed538` |
| **事件构建** | Nostr 事件签名和序列化 | 已完成 | `49ed538` |
| **NostrContext** | 会话管理，私钥仅存内存 ref | 已完成 | `49ed538` |
| **身份分享协议** | XOR 加密 + 校验和的 `dodobox://identity/` 协议 | 已完成 | `78847c1` |
| **序列号计数** | 每发送者每会话 seq 计数，持久化到 localStorage | 已完成 | `d7f7bb5` |
| **间隙检测** | 扫描消息序列号检测缺失消息，插入可点击的间隙指示器 | 已完成 | `d7f7bb5` |
| **消息恢复** | recoverMessages() 扩展时间窗口重新拉取缺失消息 | 已完成 | `d7f7bb5` |
| **发送状态指示** | pending（脉冲点）/ sent（绿色勾）/ failed（红色叉），失败消息保留并支持点击重试 | 已完成 | `d7f7bb5` |

## Hooks

| Hook | 功能 | 状态 | 来源 |
|------|------|------|------|
| `use-chats` | 聊天列表管理 | 已完成 | `49ed538` |
| `use-messages` | 消息收发，ref-based send queue，间隙恢复，发送状态与重试 | 已完成 | `49ed538`, `d7f7bb5` |
| `use-contacts` | 联系人 CRUD | 已完成 | `49ed538` |
| `use-mounted` | 客户端挂载检测（useSyncExternalStore） | 已完成 | `5b0f327` |
| `use-updater` | OTA 更新生命周期管理 | 已完成 | `ea07e44` |

## 部署与构建

| 模块 | 功能 | 状态 | 来源 Commit |
|------|------|------|-------------|
| **Docker** | 多阶段构建（pnpm + standalone output） | 已完成 | `49ed538` |
| **docker-compose** | app + strfry relay 编排 | 已完成 | `49ed538` |
| **Health Check** | `/api/health` 端点 | 已完成 | `5b0f327` |
| **版本化镜像** | `dodo-box:${APP_VERSION}` 标签 | 已完成 | `336f147` |
| **Deploy 脚本** | release 分支构建 + CHANGELOG + git tag | 已完成 | `11a7575` |
| **Android Capacitor** | Capacitor 原生 Android 构建 | 已完成 | `f670036` |
| **OTA 热更新** | @capgo/capacitor-updater 集成 | 已完成 | `5694c29` |

## 测试基础设施

| 模块 | 功能 | 状态 | 来源 Commit |
|------|------|------|-------------|
| **Vitest** | 单元/集成测试框架 | 已完成 | `d83b816` |
| **Playwright** | E2E 测试（headless Chromium） | 已完成 | `d83b816` |
| **测试覆盖** | 80+ 单元/集成测试，23 E2E 测试 | 已完成 | `d83b816` |

## 未实现/禁用功能

| 功能 | 状态 | 备注 |
|------|------|------|
| QR 码分享 | 禁用 | 按钮已禁用，`ea07e44` |
| 数据导出 | 禁用 | 按钮已禁用，`5b0f327` |
| 数据清除 | 禁用 | 按钮已禁用，`5b0f327` |
| 发现页帖子过滤 | 简化 | dead code 已清理，`5b4cca9` |

---

## 版本历史

| 版本 | 主要变更 |
|------|---------|
| v0.8.1 | Deploy 脚本、release 分支流程 |
| v0.8.2 | 身份分享协议重设计（XOR + checksum） |
| v0.8.3 | 移除所有 mock 数据、Dockerfile 优化 |
| v0.8.4 | 测试补充（relay-client, real-adapter） |
| v0.8.5 | 登录竞态/语言持久化/联系人缓存/快速发送修复 |
| v0.8.6 | IndexedDB 移除、ErrorView 提取、Docker 改进 |
| dev | OTA 热更新、Android Capacitor、updater 生命周期修复、seq 间隙检测与消息恢复、发送状态指示 |
