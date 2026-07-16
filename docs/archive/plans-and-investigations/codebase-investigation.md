# 代码库全面调查报告

> 调查日期：2026-03-22
> 基于 `docs/bug-fix-checklist.md` 和 `docs/feature-table.md` 对当前代码进行逐项验证。
> 用于后续开发的基准参考文档。

---

## 调查总结

| 类别 | 总项数 | 已确认修复 | 部分修复/存疑 | 未实现(设计如此) |
|------|--------|-----------|--------------|-----------------|
| 登录模块 | 4 | 4 | 0 | 0 |
| 消息/聊天模块 | 6 | 6 | 0 | 0 |
| 联系人模块 | 4 | 3 | 1 | 0 |
| 设置模块 | 4 | 2 | 0 | 2 |
| Nostr 协议层 | 7 | 7 | 0 | 0 |
| Docker/部署 | 8 | 8 | 0 | 0 |
| UI/样式 | 7 | 7 | 0 | 0 |
| **总计** | **40** | **37** | **1** | **2** |

---

## 一、登录模块 (Bug #1-4)

### Bug #1: 暗色模式输入框文字不可见 — FIXED

- **文件**: `app/login/page.tsx`
- **行号**: 149 (用户名), 164 (密码)
- **实现**: 两个输入框均有 `text-zinc-900 dark:text-zinc-100`，确保明暗模式下文字可见
- **背景色**: `bg-zinc-50 dark:bg-zinc-800`，与文字色形成对比
- **状态**: 无风险

### Bug #2: 登录竞态条件 — FIXED

- **文件**: `contexts/NostrContext.tsx`
- **行号**: 107-117
- **实现**: `queueMicrotask()` 包裹自动登出时的多个状态更新（`setSession`, `setAdapter`, localStorage 清理）
- **触发场景**: 页面刷新后 session 从 localStorage 恢复但私钥已丢失
- **状态**: 无风险

### Bug #3: 登录页语言/主题切换 — FIXED

- **文件**: `app/login/page.tsx`
- **行号**: 60-80
- **实现**:
  - 语言切换按钮 (62-71): Globe 图标，调用 `i18n.changeLanguage()`
  - 主题切换按钮 (72-78): Sun/Moon 图标，调用 `setTheme()`
  - 挂载守卫 (60): `{mounted && (...)}` 防止 SSR hydration 不匹配
- **状态**: 无风险

### Bug #4: 语言选择不持久 — FIXED

- **文件**: `lib/i18n.ts`
- **行号**: 20-24
- **实现**: i18next detection 配置
  ```typescript
  detection: {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: 'dodobox_language',
    caches: ['localStorage'],
  }
  ```
- **状态**: 无风险

---

## 二、消息/聊天模块 (Bug #5-8, #39-40)

### Bug #5: 快速发送消息丢失 — FIXED

- **文件**: `hooks/nostr/use-messages.ts`
- **行号**: 22-23 (refs), 91-130 (processQueue), 132-140 (sendMessage)
- **实现**:
  - `sendQueueRef = useRef<string[]>([])` — 队列存储在稳定 ref 中
  - `isProcessingRef = useRef(false)` — 处理锁，确保同时只发一条
  - `processQueue()` 异步循环处理队列中的消息
- **测试**: `tests/integration/hooks/use-messages-rapid.test.tsx` 覆盖 10 条快速发送
- **状态**: 无风险

### Bug #6: 聊天页 profile fetch 竞态 — FIXED

- **文件**: `app/(main)/messages/[id]/chat-view.tsx`
- **行号**: 59-73
- **实现**: useEffect 内 `let cancelled = false` + cleanup `return () => { cancelled = true }`
- **状态**: 无风险

### Bug #7: sendMessage 返回类型简化为 void — FIXED

- **文件**: `hooks/nostr/use-messages.ts`
- **行号**: 132-140
- **实现**: `async (text: string): Promise<void>`，成功通过状态更新反映
- **状态**: 无风险

### Bug #8: processQueue 缺少 await 和错误处理 — FIXED

- **文件**: `hooks/nostr/use-messages.ts`
- **行号**: 91 (async), 111 (await), 110-125 (错误处理)
- **实现**: `await adapter.sendMessage(...)` + try/catch + 失败标记 `sendStatus: 'failed'`
- **状态**: 无风险

### Bug #39: 发送失败消息保留并支持重试 — FIXED

- **文件**: `hooks/nostr/use-messages.ts`
- **行号**: 117-120 (失败标记), 142-167 (retrySend)
- **UI**: `app/(main)/messages/[id]/chat-view.tsx` 中 SendStatusIcon 组件
  - pending: 脉冲点
  - sent: 绿色勾
  - failed: 红色叉 + 点击重试
- **i18n**: `"send_failed": "Failed to send. Tap to retry."`
- **状态**: 无风险

### Bug #40: 消息序列号间隙检测 — FIXED

- **文件**: `lib/nostr/gap-detection.ts`
  - 31-73: `detectGaps()` — 按发送者扫描 seq 不连续
  - 79-111: `insertGapIndicators()` — 在检测位置插入可点击的间隙指示器
- **文件**: `lib/nostr/real-adapter.ts` — `recoverMessages()` 扩展时间窗口重新拉取
- **测试**: `tests/unit/lib/nostr/gap-detection.test.ts`
- **状态**: 无风险

---

## 三、联系人模块 (Bug #9-12)

### Bug #9: 联系人昵称丢失 — PARTIAL (存在隐患)

- **文件**: `lib/nostr/real-adapter.ts`
- **行号**: 208-213
- **实现**: `ct.petname || shortPubkey(ct.pubkey)` 作为 fallback
- **问题**:
  - IndexedDB 缓存已在 commit `5b0f327` 中移除
  - 当前无持久化缓存，完全依赖 relay 实时响应
  - **如果 relay 超时或网络慢，页面刷新后联系人名仍会回退到十六进制串**
  - 超时回退在 line 200: `resolve(this.contacts)` 返回内存数据（如为空则返回空）
- **建议**: 考虑在 localStorage 缓存联系人名作为 fallback

### Bug #10: 联系人重复 fetch — FIXED

- **文件**: `lib/nostr/real-adapter.ts`
- **行号**: 27 (contactsFetchPromise 字段), 182 (缓存检查), 196 (共享 promise), 223 (返回)
- **实现**: 共享 Promise 去重 + `getChats()` 复用 `contactsFetchPromise`
- **状态**: 无风险

### Bug #11: use-contacts 缺少错误处理 — FIXED

- **文件**: `hooks/nostr/use-contacts.ts`
- **行号**: 15-25
- **实现**: `.catch()` 记录错误 + `.finally()` 无论成败设置 `setIsLoading(false)` + `cancelled` flag
- **测试**: `tests/unit/hooks/use-contacts.test.tsx` 126-148 行
- **状态**: 无风险

### Bug #12: addContact/removeContact/updateProfile 缺少 await — FIXED

- **文件**: `lib/nostr/real-adapter.ts`
- **行号**: 289 (addContact), 310 (removeContact), 366 (updateProfile)
- **实现**: 三处 `relayPool.publish()` 调用均已添加 `await`
- **状态**: 无风险

---

## 四、设置模块 (Bug #13-16)

### Bug #13: Settings 账号 vs 身份逻辑 — FIXED

- **文件**: `components/settings/IdentityModal.tsx`
- **行号**: 132 (Account 标签), 138-140 (无身份提示), 143-153 (Share 按钮条件渲染)
- **实现**: `{activeIdentity && session.currentPubkey && (...)}` 控制 Share 按钮显示
- **状态**: 无风险

### Bug #14: 导出/清除按钮禁用 — NOT IMPLEMENTED (设计如此)

- **文件**: `app/(main)/settings/page.tsx`
- **行号**: 214-221
- **实现**: 两个按钮均有 `disabled` 属性 + `title={t('settings.coming_soon')}`
- **状态**: 功能占位，暂无实现计划

### Bug #15: QR 码按钮禁用 — NOT IMPLEMENTED (设计如此)

- **文件**: `components/settings/IdentityModal.tsx`
- **行号**: 154-156
- **实现**: `disabled` + `opacity-40 cursor-not-allowed` + `title={t('common.coming_soon')}`
- **状态**: 功能占位，暂无实现计划

### Bug #16: TTL 可配置下拉菜单 — FIXED

- **文件**: `app/(main)/settings/page.tsx`
- **行号**: 20-28 (TTL_OPTIONS), 182-212 (下拉实现), 40-47 (状态管理), 60-68 (handleTtlChange)
- **实现**: 7 个选项（10分钟 / 30分钟 / 1小时 / 1天 / 15天 / 30天 / 永久）
- **持久化**: localStorage `dodobox_message_ttl`，默认 2592000 (30天)
- **状态**: 无风险

---

## 五、Nostr 协议层 (Bug #17-23)

### Bug #17: relay-client EOSE 处理 — FIXED

- **文件**: `lib/nostr/relay-client.ts`
- **行号**: 10 (EoseCallback 类型), 15 (eoseCallbacks Map), 57-60 (EOSE 消息处理), 97-101 (subscribe onEose 参数)
- **状态**: 无风险

### Bug #18: vault-sync EOSE 即时 resolve + 10s 超时 — FIXED

- **文件**: `lib/nostr/vault-sync.ts`
- **行号**: 9 (`VAULT_SUBSCRIPTION_TIMEOUT_MS = 10000`), 21-25 (relay 连通性检查), 49-56 (EOSE 回调 resolve)
- **状态**: 无风险

### Bug #19: NostrContext 区分连接错误 vs 账户未找到 — FIXED

- **文件**: `contexts/NostrContext.tsx`
- **行号**: 160-164
- **实现**: `relayPool.getConnectedRelays().length === 0` 判断后返回不同错误信息
- **状态**: 无风险

### Bug #20: Mock 模式 opt-in — SUPERSEDED

- **状态**: 已被 Bug #21 完全取代

### Bug #21: Mock 模式完全移除 — FIXED

- **已删除文件**: `lib/nostr/mock-adapter.ts`, `lib/mock-data.ts`
- **替代**: `lib/nostr/empty-adapter.ts` (EmptyNostrAdapter) 用于 SSR 和未认证状态
- **状态**: 无 mock 代码残留

### Bug #22: sendMessage 移除多余 relayPool.connect() — FIXED

- **文件**: `lib/nostr/real-adapter.ts`
- **行号**: 103-145 (sendMessage 方法)
- **实现**: 无 `relayPool.connect()` 调用，注释说明连接在 `getContacts/getMessages` 中建立
- **状态**: 无风险

### Bug #23: 魔术数字替换为命名常量 — FIXED

- **文件**: `lib/nostr/vault-sync.ts` line 9: `VAULT_SUBSCRIPTION_TIMEOUT_MS = 10000`
- **文件**: `lib/nostr/relay-client.ts` — 使用常量定义超时和重试参数
- **状态**: 无风险

---

## 六、Docker/部署 (Bug #24-31)

### Bug #24: Dockerfile 使用 pnpm — FIXED

- **文件**: `Dockerfile`
- **行号**: 4-6, 12
- **实现**: `corepack enable && corepack prepare pnpm@latest --activate` + `pnpm install --frozen-lockfile` + `pnpm run build`
- **状态**: 无风险

### Bug #25: docker-compose relay 命令去重 — FIXED

- **文件**: `docker-compose.yml` line 11
- **实现**: `command: ["--config", "/app/strfry.conf", "relay"]`，无重复 strfry
- **状态**: 无风险

### Bug #26: healthcheck 使用 127.0.0.1 — FIXED

- **文件**: `docker-compose.yml` lines 23, 53
- **实现**: relay 和 app 的 healthcheck 均使用 `http://127.0.0.1:xxxx`
- **状态**: 无风险

### Bug #27: Docker 构建无 --mount=type=cache — FIXED

- **文件**: `Dockerfile` lines 1-35
- **实现**: 多阶段构建，无任何 `--mount=type=cache` 指令
- **状态**: 无风险

### Bug #28: NEXT_PUBLIC_NOSTR_MOCK 作为 build arg — FIXED

- **文件**: `Dockerfile` — `ARG NEXT_PUBLIC_NOSTR_MOCK=false` + `ENV NEXT_PUBLIC_NOSTR_MOCK=$NEXT_PUBLIC_NOSTR_MOCK`
- **文件**: `docker-compose.yml` line 31-33 — build args 传入 `"false"`
- **状态**: 无风险（虽然 mock 已移除，但 build arg 保留不影响）

### Bug #29: Docker 排除 root_claude_settings 符号链接 — FIXED

- **文件**: `.dockerignore` line 11 — `root_claude_settings`
- **状态**: 无风险

### Bug #30: 无构建时 NEXT_SERVER_ACTIONS_ENCRYPTION_KEY + healthcheck — FIXED

- **文件**: `Dockerfile` lines 32-33 — HEALTHCHECK 指令指向 `/api/health`
- **文件**: `app/api/health/route.ts` — `Response.json({ status: 'ok' })`
- **文件**: `docker-compose.yml` line 41 — 运行时环境变量注入
- **状态**: 无风险

### Bug #31: deploy 脚本 release 合并回 dev — FIXED

- **文件**: `scripts/deploy.sh`
- **实现**: release 分支构建完成后合并回 dev
- **状态**: 无风险

---

## 七、UI/样式 (Bug #32-38)

### Bug #32: ErrorView 使用显式 Tailwind class — FIXED

- **文件**: `components/ui/ErrorView.tsx`
- **实现**: 使用显式颜色类如 `text-zinc-500 dark:text-zinc-400`, `bg-emerald-600`
- **状态**: 无风险

### Bug #33: 共享 ErrorView 组件提取 — FIXED

- **文件**: `components/ui/ErrorView.tsx`
- **使用位置**: `app/error.tsx`, `app/(main)/error.tsx`
- **状态**: 无风险

### Bug #34: 错误边界页面 — FIXED

- **文件**: `app/error.tsx` (全局), `app/(main)/error.tsx` (main 布局)
- **实现**: 均委托给共享 ErrorView 组件
- **状态**: 无风险

### Bug #35: IndexedDB 存储移除 — FIXED

- **验证**: 代码中无 IndexedDB/idb 引用
- **当前存储**: localStorage（语言、TTL、seq 计数器）+ relay 持久化
- **状态**: 无风险

### Bug #36: defaultAvatar() 工具函数提取 — FIXED

- **文件**: `lib/utils.ts` lines 117-119
- **实现**: `picsum.photos/seed/${pubkey.slice(0, 8)}/100/100`
- **使用位置**: `real-adapter.ts` (212, 277), `chat-view.tsx` (66, 69), `contacts/page.tsx` (128)
- **状态**: 无风险

### Bug #37: updater useEffect 合并 + native 环境检测 — FIXED

- **文件**: `hooks/use-updater.ts` lines 32-42 — 单个合并 effect
- **文件**: `components/UpdateChecker.tsx` lines 56-59 — `Capacitor.isNativePlatform()` 守卫
- **状态**: 无风险

### Bug #38: cap-build-export 使用 pnpm exec — FIXED

- **文件**: `scripts/cap-build-export.js` line 20
- **实现**: `run('pnpm exec next build')`
- **状态**: 无风险

---

## 八、功能验证

### 核心功能

| 功能 | 状态 | 关键文件 |
|------|------|---------|
| Next.js 15 App Router + React 19 + TS 5.9 | 已确认 | `package.json`, `next.config.ts` |
| 路由系统 (login/messages/contacts/discover/settings) | 已确认 | `app/` 目录结构 |
| BottomNav (聊天详情页隐藏) | 已确认 | `components/ui/BottomNav.tsx` |
| 暗色模式 (next-themes class 策略) | 已确认 | `components/Providers.tsx` |
| i18n 中英双语 | 已确认 | `lib/i18n.ts`, `public/locales/{en,zh}.json` |
| 发现页 | 已确认 | `app/(main)/discover/page.tsx` |

### Nostr 协议层

| 功能 | 状态 | 关键文件 |
|------|------|---------|
| Vault 身份管理 | 已确认 | `lib/nostr/vault-sync.ts`, `lib/nostr/vault-crypto.ts` |
| 密钥派生 | 已确认 | `lib/nostr/key-derivation.ts` |
| Relay 客户端 (WebSocket + EOSE) | 已确认 | `lib/nostr/relay-client.ts` |
| NIP-17 DM 加密 | 已确认 | `lib/nostr/events.ts` |
| 身份分享协议 (XOR + checksum) | 已确认 | `lib/utils.ts` |
| 序列号计数 + 间隙检测 + 消息恢复 | 已确认 | `lib/nostr/seq-counter.ts`, `lib/nostr/gap-detection.ts` |
| 发送状态指示 (pending/sent/failed + retry) | 已确认 | `hooks/nostr/use-messages.ts` |

### 部署与构建

| 功能 | 状态 | 关键文件 |
|------|------|---------|
| Docker 多阶段构建 (pnpm + standalone) | 已确认 | `Dockerfile` |
| docker-compose (app + strfry relay) | 已确认 | `docker-compose.yml` |
| Health Check `/api/health` | 已确认 | `app/api/health/route.ts` |
| 版本化镜像标签 | 已确认 | `scripts/docker-build.sh` |
| Deploy 脚本 | 已确认 | `scripts/deploy.sh` |
| Android Capacitor | 已确认 | `capacitor.config.ts` |
| OTA 热更新 (@capgo/capacitor-updater) | 已确认 | `hooks/use-updater.ts`, `components/UpdateChecker.tsx` |

### 未实现功能

| 功能 | 状态 | 备注 |
|------|------|------|
| QR 码分享 | 按钮已禁用 | `IdentityModal.tsx:154-156` |
| 数据导出 | 按钮已禁用 | `settings/page.tsx:215` |
| 数据清除 | 按钮已禁用 | `settings/page.tsx:218` |

---

## 九、测试基础设施

### 框架配置

| 框架 | 配置文件 | 用途 |
|------|---------|------|
| Vitest 4.1 | `vitest.config.ts` | 单元/集成测试 |
| Playwright 1.58 | `playwright.config.ts` | E2E 测试 |

### Vitest 配置要点

- 双环境策略: `tests/unit/lib/**` → Node, `tests/integration/**` → jsdom
- Setup: `vitest.setup.ts` — Web Crypto polyfill + localStorage mock
- 覆盖率阈值: lines 80%, functions 80%, branches 75%
- Inline deps: `nostr-tools`

### Playwright 配置要点

- 单线程运行 (`workers: 1`, `fullyParallel: false`)
- 仅 Chromium
- 自动启动 `pnpm dev`
- CI 重试 2 次

### 测试文件清单

**单元测试 (13 files)**:
- `tests/unit/hooks/` — use-chats, use-contacts
- `tests/unit/lib/nostr/` — events, gap-detection, key-derivation, real-adapter-contacts/messages/profile, relay-client, seq-counter, vault-crypto, vault-sync
- `tests/unit/lib/` — utils

**集成测试 (3 files)**:
- `tests/integration/contexts/` — NostrContext
- `tests/integration/hooks/` — use-messages, use-messages-rapid

**E2E 测试 (3 files)**:
- `tests/e2e/` — login, messages, settings

**测试工具**:
- `vitest.setup.ts` — 全局 setup
- `tests/e2e/fixtures/auth.fixture.ts` — E2E 认证注入
- `tests/__mocks__/` — 模拟目录

---

## 十、需关注事项

### HIGH: Bug #9 联系人昵称丢失风险

- **问题**: IndexedDB 缓存已移除后，联系人名完全依赖 relay 实时响应
- **风险场景**: 页面刷新 + relay 响应慢 = 用户看到十六进制串
- **建议**: 在 localStorage 缓存联系人名作为 fallback 层

### MEDIUM: Bug #28 遗留 build arg

- **问题**: `NEXT_PUBLIC_NOSTR_MOCK` build arg 在 Dockerfile 和 docker-compose 中仍存在，但 mock 模式已完全移除
- **建议**: 清理 Dockerfile 和 docker-compose.yml 中的 `NEXT_PUBLIC_NOSTR_MOCK` 相关配置

### LOW: E2E 测试覆盖

- **现状**: 仅 3 个 E2E 测试文件，覆盖 login/messages/settings
- **缺失**: contacts 和 discover 页面无 E2E 测试
- **建议**: 后续补充关键用户流程的 E2E 测试

---

## 附录: 关键文件索引

| 文件路径 | 行数 | 职责 |
|---------|------|------|
| `app/login/page.tsx` | ~170 | 登录页 |
| `app/(main)/messages/[id]/chat-view.tsx` | ~200 | 聊天详情 |
| `app/(main)/settings/page.tsx` | ~285 | 设置页 |
| `app/(main)/contacts/page.tsx` | ~150 | 联系人页 |
| `contexts/NostrContext.tsx` | ~200 | 会话管理 |
| `hooks/nostr/use-messages.ts` | ~170 | 消息收发 |
| `hooks/nostr/use-contacts.ts` | ~60 | 联系人管理 |
| `hooks/nostr/use-chats.ts` | ~50 | 聊天列表 |
| `lib/nostr/real-adapter.ts` | ~380 | Nostr 适配器 |
| `lib/nostr/relay-client.ts` | ~110 | WebSocket 客户端 |
| `lib/nostr/vault-sync.ts` | ~120 | Vault 同步 |
| `lib/nostr/gap-detection.ts` | ~120 | 间隙检测 |
| `lib/nostr/seq-counter.ts` | ~60 | 序列号计数 |
| `lib/nostr/events.ts` | ~100 | 事件构建 |
| `lib/nostr/key-derivation.ts` | ~50 | 密钥派生 |
| `lib/nostr/vault-crypto.ts` | ~80 | Vault 加密 |
| `lib/nostr/empty-adapter.ts` | ~60 | 空适配器 |
| `lib/utils.ts` | ~120 | 工具函数 |
| `lib/i18n.ts` | ~30 | i18n 配置 |
| `components/ui/ErrorView.tsx` | ~35 | 错误视图 |
| `components/ui/BottomNav.tsx` | ~50 | 底部导航 |
| `components/settings/IdentityModal.tsx` | ~300 | 身份模态框 |
| `components/UpdateChecker.tsx` | ~60 | OTA 更新检查 |
| `hooks/use-updater.ts` | ~50 | 更新生命周期 |
