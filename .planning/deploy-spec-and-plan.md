# dodo-box 可部署测试阶段 Spec & Plan

> **调研范围**：基于 CodeGraph 索引 + 代码/配置/脚本/测试阅读，结合本地 `pnpm test`/`pnpm lint`/`pnpm check` 验证。
>
> **未执行项**：按项目 AGENTS.md 规则，未擅自触发 `pnpm build` 和 `pnpm test:e2e`，两者作为本计划验证阶段的一部分。

---

## 1. 当前状态快照

### 1.1 已实现的核心能力

| 模块 | 状态 | 关键文件 |
|---|---|---|
| 应用框架 | 完成 | Next.js 15 App Router + React 19 + Tailwind v4 + next-themes |
| 用户登录/注册 | 完成 | `app/login/page.tsx`, `contexts/NostrContext.tsx` |
| 多身份管理 | 完成 | `components/settings/IdentityModal.tsx`, `lib/nostr/vault-crypto.ts` |
| Nostr 适配层 | 完成 | `lib/nostr/index.ts`, `real-adapter.ts`, `empty-adapter.ts`, `mock-telegram-adapter.ts` |
| Relay 连接 | 完成 | `lib/welshman/relay-manager.ts`, `engine.ts` |
| 私信收发 | 完成 | `lib/welshman/crypto.ts` (NIP-17 gift wrap), `hooks/nostr/use-messages.ts` |
| 消息排序/去重/缺口恢复 | 完成 | `lib/nostr/seq-counter.ts`, `lib/nostr/gap-detection.ts` |
| 联系人管理 | 完成 | `app/(main)/contacts/page.tsx`, `hooks/nostr/use-contacts.ts` |
| 聊天列表 | 完成 | `app/(main)/messages/page.tsx`, `hooks/nostr/use-chats.ts` |
| 设置页 | 完成 | `app/(main)/settings/page.tsx` |
| 发现页 | 占位实现 | `app/(main)/discover/page.tsx`（仅有 UI 骨架，无真实数据） |
| 测试骨架 | 完成 | Vitest + Playwright E2E |
| 部署产物 | 完成 | `Dockerfile`, `docker-compose.yml`, `android/`, `site/` |

### 1.2 已验证的指标

- **Vitest 测试**：`pnpm test` 通过，**202 个测试 / 17 个文件**。
- **Lint**：`pnpm lint` 通过。
- **类型检查**：`pnpm check` **未通过**，4 个测试文件因 `NostrContextValue` 新增字段导致类型错误（见第 2 节）。
- **构建**：未执行（`pnpm build`）。
- **E2E**：未执行（`pnpm test:e2e`）。
- **Docker 构建**：未执行。

---

## 2. 阻止进入可部署测试阶段的关键问题

### 2.1 构建阻塞（P0）

1. **TypeScript 类型错误**。
   - 文件：`tests/integration/contexts/NostrContext.test.tsx`、`tests/integration/hooks/use-messages.test.tsx`、`tests/integration/hooks/use-messages-rapid.test.tsx`、`tests/unit/hooks/use-chats.test.tsx`、`tests/unit/hooks/use-contacts.test.tsx`。
   - 原因：`NostrContextValue` 接口新增了 `adapterMode` 和 `setAdapterMode`，但测试 mock 中未提供。
   - 影响：`pnpm check` 和 `pnpm build` 均会失败（`next.config.ts` 中 `ignoreBuildErrors: false`）。

2. **pnpm 构建脚本授权问题**。
   - `pnpm install` 会因未授权包（`@tailwindcss/oxide`、`sharp`、`cbor-extract` 等）的 build scripts 而失败。
   - 当前 `pnpm-workspace.yaml` 使用 `allowBuilds` 占位字段，不是 pnpm 11 有效的 `onlyBuiltDependencies` 配置。
   - 影响：CI/CD 和 Dockerfile 的 `pnpm install --frozen-lockfile` 会失败。

3. **依赖文件冲突**。
   - 仓库同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，而项目要求使用 pnpm。
   - 影响：混淆 CI/CD 和开发者，可能触发 npm 而不是 pnpm。

### 2.2 Docker 部署缺陷（P0）

1. **客户端环境变量在运行时失效**。
   - `docker-compose.yml` 中设置 `NEXT_PUBLIC_DEFAULT_RELAYS=ws://relay:7777` 和 `NEXT_PUBLIC_VAULT_SALT=dodobox-vault-v1`。
   - 但 `NEXT_PUBLIC_*` 变量在 `next build` 时固化到客户端 bundle 中。Dockerfile 中 build 阶段没有这些变量，因此运行时设置不会生效。
   - 结果：容器化部署后客户端仍会尝试连接 `wss://relay.damus.io`（默认值），而不是本地 relay。
   - 影响：自托管 Docker 部署无法正常工作。

2. **Dockerfile 未处理 pnpm 11 构建脚本授权**。
   - `RUN pnpm install --frozen-lockfile` 在 pnpm 11 下会触发 `[ERR_PNPM_IGNORED_BUILDS]`，导致构建失败。
   - 需要配置 `pnpm.onlyBuiltDependencies` 或使用 `--ignore-scripts`（后者可能破坏需要原生编译的包）。

3. **构建产物未验证**。
   - `output: 'standalone'` 已配置，但未验证 `.next/standalone` 在容器内运行是否正确。
   - `HEALTHCHECK` 使用 `/api/health`，但容器内实际端口和路径未通过真实运行验证。

### 2.3 测试配置缺陷（P1）

1. **集成测试文件被错误排除**。
   - `vitest.config.ts` 中 `include` 的 integration 模式是 `tests/integration/**/*.test.tsx`，而 `tests/integration/nostr-adapter.test.ts` 是 `.ts` 扩展名，因此**整个文件被排除在测试运行之外**。
   - 同时 `environmentMatchGlobs` 将 `tests/integration/**` 映射到 `jsdom`，但 `nostr-adapter.test.ts` 使用 Node 原生 `ws` 模块，需要 `node` 环境。

2. **集成测试缺少全局 setup**。
   - Playwright E2E 有 `global-setup.ts` 启动 `docker-compose.test.yml` 中的 test relay。
   - 但 Vitest 的集成测试（`nostr-adapter.test.ts`）没有对应的 global setup，需要手动启动 relay 才能运行。

3. **E2E 覆盖不足**。
   - `TEST-TODO.md` 列出 84 个未覆盖的测试任务（消息可靠性、联系人缓存、身份管理、relay 稳定性等）。
   - 当前 E2E 主要验证 UI 流程，缺少多账户端到端消息互通、gap recovery、失败重试、缓存隔离等关键场景。

### 2.4 运行时可靠性缺口（P1-P2）

1. **Relay 连接状态不可见**。
   - 没有 UI 显示 relay 连接状态（在线/离线/重连中）。
   - `connectToRelays` 只负责打开 socket，没有等待连接建立的超时/错误反馈。
   - 当用户登录时，如果 relay 未连接，`vaultSync.fetchVault` 可能因连接未就绪而报 "Account not found"，误导用户。

2. **联系人/消息首次加载体验差**。
   - `contact-cache` 默认关闭，首次加载联系人依赖 relay 返回 kind:3 事件。
   - 聊天列表（`useChats`）只从联系人构建，没有历史消息；因此新用户登录后聊天列表为空，直到添加联系人。
   - 联系人显示名称在 `RealNostrAdapter` 中只使用 petname，没有读取 kind:0 profile（`getProfile` 存在但 `getContacts` 未调用）。

3. **设置页 relay 配置只读**。
   - `settings/page.tsx` 只展示 `adapter.getRelays()`，没有编辑和保存接口。
   - `RealNostrAdapter.setRelays` 实现关闭并重新连接，但未持久化到 localStorage，刷新后恢复默认值。

4. **Discover 页面为占位**。
   - 仅有 UI 骨架，没有订阅频道、获取帖子、发布帖子的真实逻辑。
   - 不影响核心消息 MVP，但不应在测试阶段被当作完成项。

5. **移动端/OTA 未验证**。
   - Capacitor Android 项目存在，但未验证 `pnpm cap:build` 和 APK 构建是否成功。
   - `site/` 落地页存在，但未验证部署脚本 `scripts/cap-deploy.sh` 是否可用。

---

## 3. 可部署测试 MVP 定义

### 3.1 目标

一个**可构建、可容器化部署、可自动化测试**的最小可用版本，核心目标：

1. 用户能注册、登录、管理多个身份。
2. 用户能添加联系人并发送/接收 Nostr 私信（NIP-17 gift wrap）。
3. 消息基本可靠：按时间/seq 排序，失败可重试，丢失可检测和恢复。
4. 能稳定运行在本地 Docker（`docker compose up`）和 Playwright E2E 中。
5. 构建流水线（`pnpm check` -> `pnpm test` -> `pnpm build`）全部绿色。

### 3.2 范围边界

**在 MVP 内**：

- 登录/注册、多身份管理、联系人管理、聊天列表、聊天详情。
- Nostr real-adapter 与本地 strfry relay 的完整互通。
- 单元测试 + 集成测试 + 端到端 E2E 的核心路径覆盖。
- Docker 自托管部署（web）。
- 基础 CI 脚本（可选，不阻塞）。

**在 MVP 外（可延后）**：

- Discover 频道/帖子（当前为占位页面）。
- 移动端 Capacitor APK 构建和 OTA 更新（先验证，但不必作为阻塞项）。
- 多 relay 智能路由、relay 质量评分的高级应用。
- 完整 TEST-TODO 中所有 P2/P3 的边界测试（优先完成 P0/P1）。

---

## 4. 实施计划

### Phase 1：修复构建阻塞（1-2 天）

| 任务 | 说明 | 关键文件 |
|---|---|---|
| 修复测试 mock 类型 | 为所有 `NostrContext` mock 补充 `adapterMode: 'mock-telegram'` 和 `setAdapterMode: vi.fn()` | 4 个测试文件 |
| 修复 pnpm 构建脚本配置 | 将 `pnpm-workspace.yaml` 的 `allowBuilds` 改为有效的 `onlyBuiltDependencies` 列表；或删除 `pnpm-workspace.yaml` 并改用 `.npmrc` 配置 | `pnpm-workspace.yaml` |
| 清理 npm 产物 | 删除 `package-lock.json` | 仓库根目录 |
| 验证 pnpm check | 确保 `pnpm check` 通过 | 整个仓库 |

### Phase 2：修复 Docker 部署（1-2 天）

| 任务 | 说明 | 关键文件 |
|---|---|---|
| 运行时 relay 配置 | 将 `NEXT_PUBLIC_DEFAULT_RELAYS` 改为运行时 API 或客户端初始化配置，避免 build 时固化 | `lib/nostr/real-adapter.ts`, `lib/nostr/vault-sync.ts`, `next.config.ts` |
| Dockerfile 构建脚本 | 处理 pnpm 11 的 `onlyBuiltDependencies` 或 `--ignore-scripts`；建议 copy `.npmrc` 或 `pnpm-workspace.yaml` 配置 | `Dockerfile` |
| 构建参数 | 为必须 build 时固化的变量（如 `NEXT_PUBLIC_APP_VERSION`）使用 `ARG` | `Dockerfile`, `docker-compose.yml` |
| 验证 Docker 构建运行 | 执行 `docker compose up` 并验证 `/api/health` 和登录流程 | `docker-compose.yml` |

**运行时 relay 配置的推荐方案**（不改动架构前提下）：

1. 保留 `NEXT_PUBLIC_DEFAULT_RELAYS` 作为编译期默认值（例如 public relay）。
2. 在客户端启动时（如 `NostrProvider` mount 后），读取 window 注入的 `__DODOBOX_CONFIG__` 或调用 `/api/config` 获取实际 relay URL。
3. `RealNostrAdapter` 和 `VaultSync` 支持从外部传入 relay URLs，而不是只读 `process.env`。
4. `docker-compose.yml` 通过 volume 或 `next.config.ts` 的 `env` 将配置传给服务器端，但**客户端必须通过运行时 API 获取**。

### Phase 3：运行时可靠性补齐（2-3 天）

| 任务 | 说明 | 关键文件 |
|---|---|---|
| Relay 连接状态 UI | 在 settings 或 chat 页面显示连接状态，连接失败时给出明确提示 | `components/ui/`, `lib/welshman/relay-manager.ts` |
| 登录等待/重试 | 登录时等待 relay 连接就绪，避免误报 "Account not found" | `contexts/NostrContext.tsx`, `lib/nostr/vault-sync.ts` |
| 联系人名称优化 | `getContacts` 使用 kind:0 profile fallback（display_name > name > npub） | `lib/nostr/real-adapter.ts` |
| 聊天列表默认行为 | 从联系人构建 chat 列表；如果没有联系人，显示空状态；添加联系人后自动刷新 | `hooks/nostr/use-chats.ts` |
| Relay 编辑持久化 | settings 中支持编辑、保存、持久化 relay 列表到 localStorage | `app/(main)/settings/page.tsx`, `lib/nostr/real-adapter.ts` |
| 登出提示 | 刷新后私钥丢失导致的自动登出应显示明确提示 | `contexts/NostrContext.tsx`, `app/(main)/layout.tsx` |

### Phase 4：测试修复与补齐（2-3 天）

| 任务 | 说明 | 关键文件 |
|---|---|---|
| 修复集成测试配置 | 将 `vitest.config.ts` 中 integration 的 include 改为 `*.test.{ts,tsx}`，并为 `nostr-adapter.test.ts` 单独指定 `node` 环境 | `vitest.config.ts` |
| 集成测试全局 setup | 添加 Vitest global setup，在测试前启动 `docker-compose.test.yml` 中的 strfry relay | `tests/integration/global-setup.ts` |
| 补齐 P0 测试 | 优先完成 `TEST-TODO.md` 中 P0 项（消息排序/去重、gap recovery、发送重试、联系人显示、添加/删除联系人） | `tests/unit/`, `tests/integration/`, `tests/e2e/` |
| 补齐 P1 测试 | 身份管理、relay 连接、chat 列表、错误降级 | 测试目录 |
| 验证覆盖率 | 运行 `pnpm test:coverage` 确保核心模块覆盖率达到 80% | `vitest.config.ts` |

### Phase 5：E2E 与部署验证（2-3 天）

| 任务 | 说明 | 关键文件 |
|---|---|---|
| 运行 E2E 套件 | 执行 `pnpm test:e2e`，确认所有 spec 通过 | Playwright tests |
| 修复 E2E 失败项 | 重点修复多用户聊天、rapid burst、登录注册等失败场景 | `tests/e2e/` |
| Docker 端到端 | 在 Docker 环境中运行 Playwright E2E 或手动验证 | `docker-compose.yml` |
| 移动构建验证 | 执行 `pnpm cap:build` 和 `pnpm cap:apk:debug`，确认 APK 可构建（可选） | Capacitor scripts |
| 部署文档 | 编写/更新 `README.md` 或 `docs/deployment.md`，包含 Docker 部署和本地测试步骤 | `README.md`, `docs/` |

---

## 5. 验证标准（Definition of Done）

### 5.1 必须达成

- [ ] `pnpm check` 通过（typecheck + lint）。
- [ ] `pnpm test` 通过（所有 Vitest 测试）。
- [ ] `pnpm build` 通过（需首次执行并验证）。
- [ ] `docker compose up` 成功，容器健康检查通过，web 应用可访问。
- [ ] `pnpm test:e2e` 通过（或至少核心登录/注册/消息流程通过）。
- [ ] 本地 strfry relay 环境下，多账户 A/B 可互相发送消息并实时收到。

### 5.2 建议达成

- [ ] 核心模块测试覆盖率 >= 80%（`pnpm test:coverage`）。
- [ ] Discover 页面明确标记为占位，或在 MVP 中隐藏入口。
- [ ] 提供一份 `docker-compose.yml` 的本地自托管 README 说明。
- [ ] CI 脚本（GitHub Actions / GitLab CI）自动运行 `pnpm check` 和 `pnpm test`。

---

## 6. 风险与未决问题

### 6.1 技术风险

1. **Welshman 成熟度**：welshman 库的 API 和连接行为可能在后续版本变化。当前代码已固定版本 `0.8.9`，风险可控。
2. **NIP-17 gift wrap 的 `created_at` 随机化**：`subscribeToMessages` 故意不使用 `since` 过滤（注释说明）。在高消息量下，这会导致所有历史 gift wrap 被反复推送到客户端，需要测试性能边界。
3. **私钥内存安全**：设计为内存-only，但刷新后必须重新登录。需在 UI 中明确提示，避免用户误解为 bug。
4. **Docker 客户端环境变量**：如果必须保留当前架构，需要引入运行时配置 API，这是本计划中最关键的架构改动之一。

### 6.2 未决问题（需要用户确认）

1. **部署目标**：是否以 Docker web 部署为优先？还是优先 Capacitor APK + OTA？
2. **默认 Relay**：是否允许公网 relay（如 damus.io）作为默认？还是强制本地/自托管 relay？
3. **Discover 优先级**：是否在本次 MVP 中实现真实频道/帖子？还是延后？
4. **CI/CD 工具**：使用 GitHub Actions、GitLab CI，还是其他？
5. **是否允许暂时修改 next.config.ts 的 `ignoreBuildErrors`**：不建议，但如果想先快速跑通构建，可作为临时方案。

---

## 7. 建议的优先级排序

按**功能重要性优先**原则（而非难度），建议执行顺序：

1. **P0：构建修复**（Phase 1）—— 当前无法进入任何部署阶段，必须先修复。
2. **P0：Docker 客户端配置**（Phase 2）—— 没有它，容器化部署不可用。
3. **P1：核心运行时可靠性**（Phase 3）—— 确保用户能完整完成注册->登录->添加联系人->发消息->收消息。
4. **P1：测试补齐**（Phase 4）—— 用测试锁定 Phase 3 的改动，并为 E2E 做准备。
5. **P1：E2E 与部署验证**（Phase 5）—— 最终端到端验证。
6. **P2/P3：其余 TEST-TODO 项和移动/OTA** —— 在 MVP 验证通过后再扩展。

---

## 8. 附录：关键文件清单

- `app/login/page.tsx` - 登录/注册 UI
- `app/(main)/layout.tsx` - 主布局 + auth guard
- `app/(main)/messages/page.tsx` - 聊天列表
- `app/(main)/messages/[id]/chat-view.tsx` - 聊天详情
- `app/(main)/contacts/page.tsx` - 联系人
- `app/(main)/settings/page.tsx` - 设置
- `contexts/NostrContext.tsx` - 全局 session + adapter 管理
- `lib/nostr/real-adapter.ts` - 真实 Nostr 适配器
- `lib/nostr/vault-sync.ts` - vault 同步
- `lib/nostr/vault-crypto.ts` - vault 加密
- `lib/nostr/key-derivation.ts` - 用户名/密码派生密钥
- `lib/welshman/relay-manager.ts` - relay 连接/发布/订阅
- `lib/welshman/crypto.ts` - NIP-17 gift wrap / 签名
- `lib/welshman/engine.ts` - welshman 单例初始化
- `lib/welshman/storage.ts` - IndexedDB 持久化（已实现但可能未使用）
- `lib/mock-telegram-server.ts` - Mock Telegram 服务端 store
- `app/api/telegram/[token]/route.ts` - Mock Telegram API 路由
- `Dockerfile` - 容器构建
- `docker-compose.yml` - 容器编排（含 strfry relay）
- `docker-compose.test.yml` - 测试专用 relay
- `vitest.config.ts` - 测试配置（需修复）
- `playwright.config.ts` - E2E 配置
- `TEST-TODO.md` - 测试任务清单

---

**下一步建议**：先执行 Phase 1，让 `pnpm check` 通过，然后执行 Phase 2 让 Docker 构建可跑通。这两步完成后，项目就进入了“可构建 + 可容器化”的状态，再进入运行时可靠性和测试补齐。
