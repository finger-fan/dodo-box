# Bug 修复检查表

> 从 git 历史中提取的所有 bug 修复相关改动，按模块分类。
> 用于全面回归检查，确认每个修复仍然有效。

---

## 登录模块

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 1 | 登录页暗色模式：输入框文字在暗色模式下不可见（白字白底），添加 `text-zinc-900` 和 `dark:` variants | `255c0c9`, `5756ab7` | [ ] |
| 2 | 登录竞态条件：登录时偶尔显示"找不到账户"，用 `queueMicrotask` 延迟状态更新修复 | `5b0f327`, `ce3f379` | [ ] |
| 3 | 登录页语言/主题不生效：登录页添加语言/主题切换按钮，确保第一个界面就能响应设置 | `ce3f379` | [ ] |
| 4 | 语言选择不持久：切换中文后回到登录页变回英文，通过 i18next detection 配置持久化到 localStorage | `ce3f379`, `5b4cca9` | [ ] |

## 消息/聊天模块

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 5 | 快速发送消息丢失：连续快速发送消息时对方只收到部分，用 ref-based send queue 替代 `isSending` state guard | `ce3f379` | [ ] |
| 6 | 聊天页 profile fetch 竞态：添加 cancellation guard 防止 stale setState | `ea07e44` | [ ] |
| 7 | `sendMessage` 返回类型简化为 void（移除未使用的 `NostrResult`） | `ea07e44` | [ ] |
| 8 | `use-messages` processQueue 缺少 await 和错误处理 | `5b0f327` | [ ] |
| 39 | 发送失败消息被静默丢弃：失败消息现在保留在列表中显示 failed 状态，支持点击重试 | `d7f7bb5` | [ ] |
| 40 | 消息序列号间隙无感知：添加 seq gap 检测，自动插入间隙指示器，支持点击恢复缺失消息 | `d7f7bb5` | [ ] |

## 联系人模块

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 9 | 联系人昵称丢失：切换页面后联系人名变回十六进制串，通过缓存联系人名 + 超时 fallback（最初用 IndexedDB，后改为 relay 持久化） | `ce3f379`, `5b0f327` | [ ] |
| 10 | 联系人重复 fetch：添加 `contactsFetched` cache flag 和 shared promise 去重 | `5b4cca9`, `ea07e44` | [ ] |
| 11 | `use-contacts` 缺少错误处理 | `5b0f327` | [ ] |
| 12 | `addContact`/`removeContact`/`updateProfile` 的 `relayPool.publish()` 缺少 await | `5b4cca9` | [ ] |

## 设置模块

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 13 | Settings 账号 vs 身份逻辑错误：Share 按钮仅在 `activeIdentity` 存在时显示；无身份时显示 Account 标签 | `5756ab7` | [ ] |
| 14 | 导出/清除按钮禁用（功能未实现） | `5b0f327` | [ ] |
| 15 | QR 码按钮禁用（功能未实现） | `ea07e44` | [ ] |
| 16 | Settings TTL 硬编码替换为可配置下拉菜单（7 选项） | `ce3f379` | [ ] |

## Nostr 协议层

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 17 | relay-client 添加 EOSE 消息处理和 `onEose` 回调 | `ce3f379` | [ ] |
| 18 | vault-sync 使用 EOSE 即时 resolve，超时扩展到 10s，检查中继连通性 | `ce3f379` | [ ] |
| 19 | NostrContext 区分 no-relay-connection vs account-not-found 错误 | `ce3f379` | [ ] |
| 20 | mock 模式改为 opt-in（`envMock === 'true'`），防止生产环境出现 mock 数据 | `5756ab7` | [ ] |
| 21 | mock 模式完全移除，删除所有 mock adapter 和 fake data | `9624488` | [ ] |
| 22 | `sendMessage` 热路径中移除不必要的 `relayPool.connect()` 调用 | `5b4cca9` | [ ] |
| 23 | relay-client / real-adapter 中的魔术数字替换为命名常量 | `5b0f327` | [ ] |

## Docker / 部署

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 24 | Dockerfile 从 npm 切换到 pnpm（corepack） | `3de6910` | [ ] |
| 25 | docker-compose relay 命令去重（移除多余 `strfry`） | `3de6910` | [ ] |
| 26 | docker-compose healthcheck 使用 `127.0.0.1`（strfry 仅监听 IPv4） | `3de6910` | [ ] |
| 27 | Docker 构建禁止 `--mount=type=cache`（破坏层缓存） | `336f147` | [ ] |
| 28 | `NEXT_PUBLIC_NOSTR_MOCK` 必须作为 build arg（NEXT_PUBLIC_ 变量需要构建时设置） | `5756ab7` | [ ] |
| 29 | Docker 排除 `root_claude_settings` 符号链接 | `b854950` | [ ] |
| 30 | 移除构建时 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，添加 healthcheck endpoint | `5b0f327` | [ ] |
| 31 | deploy 脚本修复 release 合并回 dev 流程 | `336f147` | [ ] |

## UI / 样式

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 32 | ErrorView 语义色标替换为显式 Tailwind class | `ea07e44` | [ ] |
| 33 | 提取共享 ErrorView 组件，精简错误边界 | `5b4cca9` | [ ] |
| 34 | 错误边界页面添加（`app/error.tsx`, `app/(main)/error.tsx`） | `5b0f327` | [ ] |
| 35 | IndexedDB 存储移除（改用 relay 持久化） | `5b0f327` | [ ] |
| 36 | `defaultAvatar()` 工具函数提取，替代 3 处内联 picsum URL | `5b4cca9` | [ ] |

## OTA 更新 (Capacitor)

| # | 修复内容 | 来源 Commit | 检查 |
|---|---------|-------------|------|
| 37 | updater useEffect 合并，UpdateChecker 添加 native 环境检测 guard | `ea07e44` | [ ] |
| 38 | cap-build-export 脚本使用 `pnpm exec` 替代 `npx` | `ea07e44` | [ ] |

---

## 检查方法

1. **逐项验证**：对每个修复项，在当前代码中确认修复仍然存在且有效
2. **回归测试**：运行 `pnpm test` 确认单元/集成测试通过
3. **手动测试**：对 UI 相关修复（#1-4, #13-16, #32-34），在浏览器中手动验证
4. **部署验证**：对 Docker 相关修复（#24-31），执行一次完整构建验证
